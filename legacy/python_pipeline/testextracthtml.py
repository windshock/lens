from bs4 import BeautifulSoup

# Sample HTML content with JavaScript code
html_content = """
<!DOCTYPE html>
<html>
<head>
    <title>Example Page</title>
    <script type="text/javascript">
        console.log("This is a JavaScript code block.");
    </script>
</head>
<body>
    <h1>This is a heading</h1>
    <p>This is a paragraph.</p>
    <div>
        <a href="https://example.com">Link 1</a>
        <a href="https://example.com/2">Link 2</a>
    </div>
    <footer>
        <p>Footer content</p>
    </footer>
    <script type="text/javascript">
        alert("Another JavaScript code block.");
    </script>
</body>
</html>
"""

# Function to recursively extract text and specific tags
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

# Parse the HTML content
soup = BeautifulSoup(html_content, 'html.parser')
body = soup.body

# Extract elements
elements = extract_text_and_tags(body)

# Create a single string output
output = ' '.join(str(element) for element in elements) 

# Remove trailing whitespace
output = output.strip()

# Print the output string
print(output)
