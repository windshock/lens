from exchangelib import Credentials, Account, DELEGATE
import re
import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from urllib.parse import urlparse
import time
from PIL import Image
import pytesseract
from io import BytesIO
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from bs4 import BeautifulSoup
from selenium.webdriver.support import expected_conditions as EC
from openai import OpenAI
import socket
import os
import ollama



#client = OpenAI()
#google_gemini = 'your_gemini_api_key'

# Exchange server connection settings
USERNAME = 'your_username'
PASSWORD = 'your_password'
EMAIL_ADDRESS = 'your_email@example.com'
SERVER_URL = 'https://outlook.skplanet.com/ews/exchange.asmx'

# Set ChromeDriver path (download from https://sites.google.com/chromium.org/driver/)
chrome_driver_path = '/opt/homebrew/bin/chromedriver'

def is_internal_ip(url):
    try:
        hostname = urlparse(url).hostname
        ip_address = socket.gethostbyname(hostname)
        if re.match(r"(^127\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^192\.168\.)", ip_address):
            print(f"hostname = {hostname} is intranet")
            return True
        print(f"hostname = {hostname} is internet")
        return False
    except Exception as e:
        print(f"Error checking internal IP: {e}")
        return False


# Initialize WebDriver
def initialize_driver():
    chrome_options = Options()
    chrome_options.add_argument('--headless')  # Run Chrome in headless mode (no GUI)
    chrome_options.add_argument('--disable-gpu')  # Disable GPU acceleration
    return webdriver.Chrome(service=Service(chrome_driver_path), options=chrome_options)

driver = initialize_driver()

# Function to fetch content of a link using Selenium and extract text nodes
def get_text_content_selenium(link):
    try:
        driver = initialize_driver()
        driver.get(link)

        # Wait for page to load completely (adjust timeout as needed)
        driver.implicitly_wait(10)  # Example wait time, adjust as necessary

        # Get page source (entire HTML content)
        full_html = driver.page_source

        return full_html

    except Exception as e:
        print(f"Error fetching full HTML content with Selenium: {e}")
        return ""
    finally:
        driver.quit()


# Function to extract image links from HTML content
def extract_image_links(html_content):
    # Implement using BeautifulSoup or other method as previously shown
    pass

# Function to extract text from an image using Tesseract OCR
def extract_text_from_image(image_url):
    try:
        response = requests.get(image_url)
        image = Image.open(BytesIO(response.content))
        extracted_text = pytesseract.image_to_string(image)
        return extracted_text.strip()
    except Exception as e:
        print(f"Error extracting text from image: {e}")
        return ""

# Function to extract links from email body
def extract_links(body):
    url_pattern = r'https?://\S+?(?=[\]>\s])'
    urls = re.findall(url_pattern, body)

    links = re.findall(r'https?://\S+', body)
    extracted_links = []
    for link in links:
        url = re.sub(r'[\[\]<>"]','',link)
        extracted_links.append(url)
    return extracted_links

def clean_text_from_html(html_content):
    # Parse HTML content
    soup = BeautifulSoup(html_content, 'html.parser')

    # Get text content without tags
    text_content = soup.get_text(separator=' ', strip=True)

    # Remove excessive whitespace including newlines and tabs
    cleaned_text = re.sub(r'\s+', ' ', text_content)

    return cleaned_text.strip()

# Function to fetch content of a link using Selenium
def get_link_content_selenium(link):
    try:
        driver.get(link)

        # Get page source (entire HTML content)
        full_html = driver.page_source

        return full_html

    except Exception as e:
        print(f"Error fetching full HTML content with Selenium: {e}")
        return ""
    finally:
        driver.quit()

# Function to check if a link is phishing
def check_phishing_link(link, content):
    #client = OpenAI(api_key='your_openai_api_key_here')  # Replace with your OpenAI API key
    prompt = f"You are an assistant that identifies phishing links and provides detailed reasons.\nIs the following link a phishing link? URL: {link}\nContent: {content}. If it is phishing, please provide detailed reasons."
    response = ollama.chat(model='llama3', messages=[
        {
            'role': 'user',
            'content': prompt,
        },
    ])
    result = response['message']['content']
    result = response.choices[0].text.strip()
    is_phishing = 'phishing' in result.lower()
    return is_phishing, result

# Function to report a phishing link
def report_phishing_link(link, reason, email):
    try:
        subject = email.subject
        msg = f"A phishing link was detected: {link}\n\nReason:\n{reason}\n\nOriginal Email:\nSubject: {subject}\n\n{email.text_body}"
        email.reply(subject=f"Phishing Link Report: {link}", body=msg)
        print(f"Reported phishing link to security: {link}")
    except Exception as e:
        print(f"Error reporting phishing link: {e}")

# Main function to process emails
def main():
    print("Checking for new emails...")
    while True:
        try:
            # Connect to Exchange server
            credentials = Credentials(USERNAME, PASSWORD)  # Replace with your Exchange server credentials
            account = Account(primary_smtp_address=EMAIL_ADDRESS, credentials=credentials, autodiscover=True, access_type=DELEGATE)
            
            for item in account.inbox.filter(is_read=False):
                item.is_read = True
                item.save()
                print("checking item")
                subject = item.subject
                body = item.text_body
                links = extract_links(body)
                print(f"links : {links}")
                for link in links:
                    print(f"link : {link}")
                    content = get_text_content_selenium(link)
                    imgtext = ''
                    #image_links = extract_image_links(content)  # Implement as needed
                    #imgtext = ''
                    #for image_link in image_links:
                    #    imgtext += extract_text_from_image(image_link)
                    content = clean_text_from_html(content)
                    print(f"content : {content}")
                    is_internal = is_internal_ip(link)
                    if not is_internal:
                        print("connect llm")
                        is_phishing, reason = check_phishing_link(link, imgtext + content)
                        if is_phishing:
                            report_phishing_link(link, reason, item)
            
            print("sleep 60 second")
            time.sleep(60)  # Check for new emails every 60 seconds
        
        except Exception as e:
            print(f"Error processing emails: {e}")

if __name__ == "__main__":
    main()
