import re
import tldextract
import argparse
import requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from urllib.parse import urlparse
import time
from bs4 import BeautifulSoup
import ollama
import pytesseract
from io import BytesIO
from PIL import Image
import base64
from urllib.parse import urljoin
import json



# Function to initialize the Selenium WebDriver
def initialize_driver():
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument("--ignore-certificate-errors")
    chrome_options.add_argument("--allow-running-insecure-content")
    chrome_options.add_argument("--unsafely-treat-insecure-origin-as-secure=*")
    chrome_options.add_argument("--disable-client-side-phishing-detection")
    chrome_options.add_argument("--disable-web-security")
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument("--start-maximized")
    chrome_options.add_argument('--disable-setuid-sandbox')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_experimental_option("prefs", {
        "safebrowsing.enabled": False
    })

    service = Service('/opt/homebrew/bin/chromedriver')
    driver = webdriver.Chrome(service=service, options=chrome_options)
    return driver

def extract_text_from_images(image_urls, link):
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
                abs_img_url = urljoin(link, image_url)
                response = requests.get(abs_img_url)
                image = Image.open(BytesIO(response.content))

            extracted_text = pytesseract.image_to_string(image)
            texts.append(extracted_text.strip())
        except Exception as e:
            print(f"Error extracting text from image {image_url}: {e}")
            texts.append("")

    return ' '.join(texts)

def extract_text_and_tags(element):
    elements = []

    for child in element.children:
        if isinstance(child, str):
            if child.strip():
                elements.append(child.strip())
        else:
            if child.name in ['input', 'textarea', 'form', 'a']:
                elements.append(child)
            elements.extend(extract_text_and_tags(child))

    return elements


# Function to fetch content of a link using Selenium
def get_link_content_selenium(link):
    try:
        driver = initialize_driver()
        driver.get(link)

        # Wait for page to load (adjust timeout as needed)
        time.sleep(5)  # Example wait time, adjust as necessary

        # Get page source after execution of scripts and redirects
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        #content = soup.get_text(separator=' ', strip=True)
        img_tags = soup.find_all('img')
        image_links = [img['src'] for img in img_tags if 'src' in img.attrs]
        imgText = extract_text_from_images(image_links, link)
        elements = extract_text_and_tags(soup.body)
        html = ' '.join(str(element) for element in elements)
        soup = BeautifulSoup(html, 'html.parser')
        html = ' '.join(soup.prettify().split())
        url = driver.current_url
        return imgText, html, url

    except Exception as e:
        print(f"Error fetching link content with Selenium: {e}")
        return ""
    finally:
        driver.quit()

# Function to check if a link is phishing using Ollama API
def check_phishing_link(link, ocr, html, whoisinfo):
    prompt = f"""
    You are a security expert. Determine if the webpage is phishing or legitimate.

    1. Analyze the HTML, URL, and OCR-extracted text for any SE techniques often used in phishing attacks. Point out any suspicious elements found in the HTML, URL, or text. 
    2. Identify the brand name. If the html appears to resemble a legitimate web page, verify if the URL, WHOIS  matches the legitimate domain name associated with the brand, if known. 
    3. Decide if the site is phishing or legitimate. If unsure, state 'unknown'.
    4. Print results as JSON format including the following keys: 
       - phishing_score: int (0 to 10 risk scale)
       - brand: str (brand name or None)
       - phishing: boolean (true if phishing, false if legitimate)
       - suspicious_domain: boolean (true if domain is suspicious)
       - reason: str (very deiled reason)

    Phishing signs include:
    - Account issues alerts
    - Unexpected rewards
    - Missing package/payment notices
    - Fake security warnings
    - Input Private Key

    Limitation:
    - Even with legitimate whois information, subdomains of hosting services (like Cloudflare, AWS, Azure, Netlify) should not be assumed legitimate.
    - It is normal for the subdomain to include dev, stg, and prd.
    - A server error, page error, page not found, or no data in html is not a phishing sign.
    - OCR, HTML has no data is not a phishingn sign.
    - The HTML may be shortened and simplified.  
    - The OCR-extracted text may not always be accurate, or may look like gibberish.. 
    - The Korean top-level domain (`kr`) is not suspicious.
    - Internal development or testing environment is not suspicious.

    URL: \"{link}\"
    Text extracted using OCR: \"{ocr}\" 
    WHOIS: \"{whoisinfo}\"
    HTML: 
{html}
    """
    prompt = f"""
Analyze the following details:

URL: {link}
Text extracted using OCR: \"\"\"{ocr}\"\"\"
WHOIS: \"\"\"{whoisinfo}\"\"\"
HTML: \"\"\"{html}\"\"\"
    """
    print(prompt)
    try:
        response = ollama.chat(model='phishingScanner', messages=[
            {
                'role': 'user',
                'content': prompt,
            },],
            )
        result = response['message']['content'].strip()
        return result
    except Exception as e:
        print(f"Error checking phishing link with Ollama: {e}")
        return False, ""

def extract_whois_data(whois_info) :
    # Define a dictionary to hold the extracted information
    whois_data = {
        'Domain Name': '',
        'Registrar': '',
        'Updated Date': '',
        'Creation Date': '',
        'Expiry Date': '',
        'Name Servers': '',
        'Contact Email': ''
    }
    # Regular expression pattern to extract specific details
    pattern = r'Domain Name:\s*(.*?)\n|Registrar:\s*(.*?)\n|Updated Date:\s*(.*?)Z\n|Creation Date:\s*(.*?)Z\n|Registry Expiry Date:\s*(.*?)Z\n|Name Server:\s*(.*?)\n|Registrar Abuse Contact Email:\s*([\w.-]+@[\w.-]+\.\w+)'
    
    # Extracting important information
    matches = re.findall(pattern, whois_info, re.MULTILINE | re.DOTALL)
    
    # Assigning extracted data to dictionary keys
    for match in matches:
        for i in range(len(match)):
            if match[i]:
                key = list(whois_data.keys())[i]
                whois_data[key] = match[i].strip()
    
    return f"Domain Name: {whois_data['Domain Name']}, Registrar: {whois_data['Registrar']}, Updated Date: {whois_data['Updated Date']}, Creation Date: {whois_data['Creation Date']}, Expiry Date: {whois_data['Expiry Date']}, Name Servers: {whois_data['Name Servers']}, Contact Email: {whois_data['Contact Email']}"

def fetch_whois_info(domain):
    url = f"https://yesnic.com/whois/index2.php?domain={domain}"
    response = requests.get(url)
    
    if response.status_code == 200:
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find the section containing WHOIS information
        whois_info_section = soup.find('td', style='border:solid 1px #91b9c3; font-size:13px; padding:15px; color:#555; line-height:18px;')
        
        if whois_info_section:
            whois_info = whois_info_section.get_text()
            #whois_info = extract_whois_data(whois_data)
            return whois_info
        else:
            return "WHOIS information not found."
    else:
        return f"Failed to fetch WHOIS information. HTTP Status Code: {response.status_code}"

# Main function to read URLs from a file and check for phishing
def main(url):
    url = url.strip()
    if url and not re.search(r'\.(png|jpg|gif)$', url):
        ocr,html,url = get_link_content_selenium(url)
        # Regular expression to find the JSON part
        json_pattern = re.compile(r"\{\s*\"phishing_score\".*?\}", re.DOTALL)
        extracted = tldextract.extract(url)
        domain = "{}.{}".format(extracted.domain, extracted.suffix)
        whoisinfo = fetch_whois_info(domain)
        reason = check_phishing_link(url, ocr, html, whoisinfo)
        print("-----------------------------------------------------------------------------------------------------------")
        print(f"url : {url}")
        print(reason)
        json_match = json_pattern.search(reason)
        if json_match:
            json_str = json_match.group()
            # Optionally, you can load it into a dictionary to ensure it's valid JSON
            try:
                json_data = json.loads(json_str)
                json_data['url'] = url
                # Print the JSON string
                print(json.dumps(json_data, indent=2))
            except json.JSONDecodeError as e:
                print(f"Error decoding JSON: {e}")
        else:
            print("No JSON found in the output.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check if a URL is a phishing link.")
    parser.add_argument('url', type=str, help='The URL to check for phishing.')
    args = parser.parse_args()
    
    main(args.url)

