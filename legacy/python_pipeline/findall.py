import re

# Example text containing URLs
text = """
body [https://secudium.skinfosec.co.kr/images/login/bi_kr_30.png]
June 27, 2024 Information Security Newsletter Call: 02-6400-0500 Fax: 031-5180-5003
Title June 27, 2024 Information Security Newsletter

Detail

Information provided 1 5 recent cyber attack threats... Most of them are aimed at stealing money
Information provided

Keywords include ransomware attacks, DDoS attacks, personal information leaks, artificial intelligence abuse, and dark web.

Corporate cyber security breaches are continuously increasing. According to the Korea Internet & Security Agency (KISA), there is a rapid increase from 630 cases in 2020 to 640 cases in 2021, 1,142 cases in 2022, and 1,227 cases in 2023. KISA explains that this is continuously increasing from 2022 due to the strengthening of companies' guidance and reporting of unrecognized accidents.

https://m.boannews.com/html/detail.html?tab_type=1&idx=130809


Information provided 2 Indonesia, hit by ransomware attack, suffers chaos as government services are paralyzed
Information provided

Indonesia's national data center suffered a ransomware attack, paralyzing more than 200 public services.

According to foreign media such as the daily newspaper Compass on the 26th, the Indonesian Ministry of Information and Communication announced that over 7,000 services of 210 public institutions have been suspended or delayed since the 20th due to a recent ransomware attack on the Indonesian data center.

https://www.msn.com/ko-kr/news/techandscience/%EB%9E%9C%EC%84%AC%EC%9B%A8%EC%96%B4-%EA%B3%B5%EA%B2%A9-%EB%B0%9B%EC%9D%80-%EC%9D%B8%EB%8F%84%EB%84%A4%EC%8B%9C%EC%95%84-%EC%A0%95%EB%B6%80-%EC%84%9C%EB%B9%84%EC%8A%A4-%EB%A7%88%EB%B9%84%EB%A1%9C-%EB%8C%80%ED%98%BC%EB%9E%80/ar-BB1oTzGq


Information provided 3 Attackers who directly manipulated the WordPress plugin source code and planted a backdoor
Information provided

According to security news outlet Bleeping Computer, backdoors have been inserted into many WordPress plugins. It was revealed that an attacker or an attack group had tampered with the source code of at least five plugins, and had used this to create their own administrator accounts on multiple WordPress sites. Although this campaign was discovered only yesterday, it appears that the actual attacks began last weekend. The developers of the affected patches were contacted by WordPress and immediately began developing and distributing patches. It is analyzed that the five plug-ins in question were installed on a total of more than 35,000 websites.

https://m.boannews.com/html/detail.html?tab_type=1&idx=130868


Information provided 4 “Increased activity of Chinese-linked hacker groups for zero-day vulnerability attacks”
Information provided

Analysis has shown that the activities of Chinese-linked spy groups that attack ‘zero-day vulnerabilities’ are increasing.

A zero-day attack is a technique that finds computer software vulnerabilities and attacks when an official supplementary patch has not been released.

https://m.news1.kr/articles/?5458339&26#_enliple


Information provision 5
Information provided


We will do our best until our customers are satisfied. Security Service OK!
If you have any questions or inconveniences, please contact the customer center <http://infosec.adtcaps.co.kr/question/questionReg.do>.
"""

# Regular expression to find URLs
url_pattern = r'https?://\S+?(?=[\]>\s])\b(?!\.png\b|\.jpg\b|\.gif\b)'



# Find all URLs in the text
urls = re.findall(url_pattern, text)

# Print all found URLs
for url in urls:
    print(url)
