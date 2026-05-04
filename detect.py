import argparse
import json
from pathlib import Path

import cv2

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


PLATE_CLASS_KEYWORDS = ("plate", "license", "licence", "number")
HAAR_CONFIDENCE = 0.35


def is_license_plate_class(class_name):
    lowered = str(class_name).lower()
    return any(keyword in lowered for keyword in PLATE_CLASS_KEYWORDS)


def should_blur_detection(names, class_id):
    if isinstance(names, dict):
        if len(names) == 1:
            return True
        return is_license_plate_class(names.get(class_id, class_id))

    return True


def calculate_iou(first_box, second_box):
    x1 = max(first_box[0], second_box[0])
    y1 = max(first_box[1], second_box[1])
    x2 = min(first_box[2], second_box[2])
    y2 = min(first_box[3], second_box[3])

    if x2 <= x1 or y2 <= y1:
        return 0

    intersection = (x2 - x1) * (y2 - y1)
    first_area = (first_box[2] - first_box[0]) * (first_box[3] - first_box[1])
    second_area = (second_box[2] - second_box[0]) * (second_box[3] - second_box[1])
    union = first_area + second_area - intersection
    return intersection / union if union else 0


def add_detection(detections, detection, iou_threshold=0.35):
    for index, existing in enumerate(detections):
        if calculate_iou(existing["box"], detection["box"]) < iou_threshold:
            continue

        if detection["confidence"] > existing["confidence"]:
            detections[index] = detection
        return

    detections.append(detection)


def detect_with_yolo(image, model_path, confidence):
    if not model_path or not model_path.exists():
        return []

    if YOLO is None:
        raise ImportError("ultralytics is not installed, so YOLO detection cannot run.")

    model = YOLO(str(model_path))
    results = model(image, conf=confidence, verbose=False)
    detections = []

    for result in results:
        names = result.names

        for box in result.boxes:
            class_id = int(box.cls[0])

            if not should_blur_detection(names, class_id):
                continue

            x1, y1, x2, y2 = [int(value) for value in box.xyxy[0].tolist()]
            class_name = names.get(class_id, str(class_id)) if isinstance(names, dict) else str(class_id)
            confidence_score = float(box.conf[0])
            detections.append(
                {
                    "class": class_name,
                    "confidence": round(confidence_score, 4),
                    "box": [x1, y1, x2, y2],
                    "source": "yolo",
                }
            )

    return detections


def detect_with_haar(image, cascade_path):
    if not cascade_path or not cascade_path.exists():
        return []

    cascade = cv2.CascadeClassifier(str(cascade_path))
    if cascade.empty():
        raise ValueError(f"Could not load Haar cascade: {cascade_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    height, width = gray.shape[:2]
    min_width = max(24, width // 12)
    min_height = max(8, height // 30)
    plates = cascade.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=4,
        minSize=(min_width, min_height),
    )

    return [
        {
            "class": "license_plate",
            "confidence": HAAR_CONFIDENCE,
            "box": [int(x), int(y), int(x + w), int(y + h)],
            "source": "haar",
        }
        for (x, y, w, h) in plates
    ]


def blur_license_plates(
    image_path,
    model_path,
    output_path,
    boxes_output_path=None,
    json_output_path=None,
    confidence=0.25,
    cascade_path=None,
):
    image_path = Path(image_path)
    model_path = Path(model_path) if model_path else None
    cascade_path = Path(cascade_path) if cascade_path else None
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")

    boxed_image = image.copy()
    detections = []

    for detection in detect_with_yolo(image, model_path, confidence):
        add_detection(detections, detection)

    for detection in detect_with_haar(image, cascade_path):
        add_detection(detections, detection)

    if not detections:
        has_yolo = bool(model_path and model_path.exists())
        has_haar = bool(cascade_path and cascade_path.exists())
        if not has_yolo and not has_haar:
            raise FileNotFoundError("No detector found. Add model.pt or haarcascade_russian_plate_number.xml.")

    height, width = image.shape[:2]
    for detection in detections:
        x1, y1, x2, y2 = detection["box"]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(width, x2), min(height, y2)

        if x2 <= x1 or y2 <= y1:
            continue

        detection["box"] = [x1, y1, x2, y2]
        label = f'{detection["source"]} {detection["confidence"]:.2f}'
        color = (0, 180, 120) if detection["source"] == "yolo" else (255, 150, 0)
        cv2.rectangle(boxed_image, (x1, y1), (x2, y2), color, 3)
        cv2.putText(
            boxed_image,
            label,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
            cv2.LINE_AA,
        )

        region = image[y1:y2, x1:x2]
        image[y1:y2, x1:x2] = cv2.GaussianBlur(region, (51, 51), 0)

    if not cv2.imwrite(str(output_path), image):
        raise RuntimeError(f"Could not save output image: {output_path}")

    if boxes_output_path:
        boxes_output_path = Path(boxes_output_path)
        boxes_output_path.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(boxes_output_path), boxed_image):
            raise RuntimeError(f"Could not save boxed image: {boxes_output_path}")

    if json_output_path:
        json_output_path = Path(json_output_path)
        json_output_path.parent.mkdir(parents=True, exist_ok=True)
        json_output_path.write_text(json.dumps({"detections": detections}, indent=2), encoding="utf-8")

    return str(output_path)


def parse_args():
    parser = argparse.ArgumentParser(description="Detect and blur license plates with YOLOv8 and Haar cascade.")
    parser.add_argument("--image", required=True, help="Path to the input image.")
    parser.add_argument("--model", default="model.pt", help="Path to trained YOLOv8 model.")
    parser.add_argument(
        "--cascade",
        default="haarcascade_russian_plate_number.xml",
        help="Path to OpenCV Haar cascade XML file.",
    )
    parser.add_argument("--output", required=True, help="Path for the blurred output image.")
    parser.add_argument("--boxes-output", help="Path for the image with bounding boxes before blur.")
    parser.add_argument("--json-output", help="Path for JSON detection metadata.")
    parser.add_argument("--confidence", type=float, default=0.25, help="YOLO confidence threshold.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    saved_path = blur_license_plates(
        image_path=args.image,
        model_path=args.model,
        output_path=args.output,
        boxes_output_path=args.boxes_output,
        json_output_path=args.json_output,
        confidence=args.confidence,
        cascade_path=args.cascade,
    )
    print(saved_path)
