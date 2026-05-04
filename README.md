# Number Plate Blurring

A Node.js frontend/server with a Python detector script that can combine YOLOv8 and OpenCV Haar cascade license plate detection.

## Folder Structure

```text
project/
|-- public/
|   |-- index.html
|   |-- style.css
|   `-- script.js
|-- uploads/
|-- output/
|-- server.js
|-- detect.py
|-- haarcascade_russian_plate_number.xml
|-- model.pt
|-- package.json
`-- requirements-python.txt
```

## Run Instructions

### 1. Install Required Tools

Before running the project, make sure these commands work:

```bash
python --version
pip --version
node --version
npm --version
```

If any command says `not recognized`, install the missing tool:

- Python: install from `https://www.python.org/downloads/`
- Node.js: install the LTS version from `https://nodejs.org/`

During Python installation, enable **Add python.exe to PATH**.
After installing Python or Node.js, close the terminal and open a new one.

### 2. Start Project

Start Python environment:

```bash
python -m venv .venv
.venv\Scripts\activate
```

Install Python dependencies:

```bash
pip install ultralytics opencv-python
```

The included Haar cascade file can detect number plates without a YOLO model:

```text
haarcascade_russian_plate_number.xml
```

For stronger results, you can also place your trained YOLOv8 license plate model in the project root. When both files are present, the detector combines both sources and removes duplicate overlapping boxes:

```text
model.pt
```

Start Node server:

```bash
npm install
node server.js
```

Open browser:

```text
http://localhost:3000
```

## Windows Troubleshooting

If `python`, `pip`, `node`, or `npm` is not recognized, the tool is either not installed or was not added to PATH.

Try the Python launcher:

```bash
py --version
py -m venv .venv
```

If `py` is also not recognized, install Python again and check **Add python.exe to PATH**.

## Workflow

1. User uploads an image in `public/index.html`.
2. Frontend JavaScript previews the selected image.
3. Frontend sends the image to Node.js:

```js
fetch("/upload", {
  method: "POST",
  body: formData,
});
```

4. `server.js` receives the image and saves it in `uploads/`.
5. `server.js` calls the Python detector script:

```bash
python detect.py --image uploads/input.jpg --model model.pt --cascade haarcascade_russian_plate_number.xml --output output/blurred-input.jpg
```

6. `detect.py` uses `model.pt` when available, also runs `haarcascade_russian_plate_number.xml`, detects license plates, and blurs detected plate regions:

```python
cv2.GaussianBlur(region, (51, 51), 0)
```

7. The processed image is saved in `output/`.
8. Node.js sends JSON back with original, bounding-box, and blurred output image URLs.
9. Frontend displays the bounding-box preview, blurred image, and download button for each result.

## Optional Enhancements Included

- Bounding-box preview before blur.
- Drag and drop image upload.
- Multiple image upload support.
- Progress/loading indicator while processing.
- Download button for each processed image.
