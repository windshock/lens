import ollama

prompt = f"You are an assistant that identifies phishing links and provides detailed reasons.\nIs the following link a phishing link? URL: {link}\nContent: {content}". If it is phishing, please provide detailed reasons."

response = ollama.chat(model='llama3', messages=[
  {
    'role': 'user',
    'content': prompt,
  },
])
print(response['message']['content'])
