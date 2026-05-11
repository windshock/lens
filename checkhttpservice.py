import socket
import requests

# 파일에서 도메인 목록 읽기
def read_domains_from_file(file_path):
    with open(file_path, 'r') as file:
        domains = [line.strip() for line in file.readlines()]
    return domains

# 주어진 도메인 목록
file_path = 'skplanetdomains.txt'
domains = read_domains_from_file(file_path)

# 내부 IP 확인 함수
def is_internal_ip(ip):
    internal_ranges = [
        (10, 8),           # 10.0.0.0/8
        (172, 12),         # 172.16.0.0/12
        (192, 168)         # 192.168.0.0/16
    ]
    first_octet, second_octet, _, _ = map(int, ip.split('.'))
    
    for range_start, range_size in internal_ranges:
        if first_octet == range_start:
            if range_start == 172:
                if 16 <= second_octet < 32:
                    return True
            else:
                return True
    return False

# 포트 열림 확인 함수
def is_port_open(ip, port):
    try:
        with socket.create_connection((ip, port), timeout=2):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

# HTTP/HTTPS 서비스 확인 함수
def check_http_service(ip, port):
    try:
        responsehttps = requests.get(f'https://{ip}:{port}', timeout=2)
        if responsehttps.ok:
            return 'https'
        responsehttp = requests.get(f'http://{ip}:{port}', timeout=2)
        if responsehttp.ok:
            return 'http'
    except requests.RequestException:
        return None
    return None

ports = [80, 443, 8000, 8080, 8443]

for domain in domains:
    try:
        ip = socket.gethostbyname(domain)
    except socket.gaierror:
        print(f"Could not resolve {domain}")
        continue
    
    if is_internal_ip(ip):
        print(f"internal ip : {domain}")
        continue
    
    for port in ports:
        if is_port_open(ip, port):
            protocol = check_http_service(domain, port)
            if protocol:
                print(f'{protocol}://{domain}:{port}')

