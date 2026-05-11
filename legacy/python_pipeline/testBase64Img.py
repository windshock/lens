import re
import requests
from PIL import Image
import pytesseract
import base64  # base64 모듈 임포트 추가
from io import BytesIO

def extract_text_from_images(image_urls):
    texts = []
    base64_pattern = re.compile(r'^data:image/.*;base64,')

    for image_url in image_urls:
        try:
            if base64_pattern.match(image_url):
                # Extract base64 data from the URL
                base64_data = image_url.split('base64,')[1]
                image_data = base64.b64decode(base64_data)
                image = Image.open(BytesIO(image_data))
            else:
                # Download the image from the URL
                response = requests.get(image_url)
                image = Image.open(BytesIO(response.content))

            extracted_text = pytesseract.image_to_string(image)
            texts.append(extracted_text.strip())
        except Exception as e:
            print(f"Error extracting text from image {image_url}: {e}")
            texts.append("")

    return texts

# 테스트를 위한 이미지 URL 리스트
image_urls = ['data:image/png;base64,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']
print(extract_text_from_images(image_urls))
