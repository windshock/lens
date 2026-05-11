import re

# 파일 경로
file_path = 'skplanetwithoutcname.zone'

def process_zone_file(file_path):
    with open(file_path, 'r') as file:
        data = file.read()
    
    # Extract domains
    domains = re.findall(r'### Domain : ([\w.-]+)', data)
    
    result = []
    updated_data = data
    
    for domain in domains:
        # Remove the trailing .zone
        domain_without_zone = re.sub(r'\.zone$', '', domain)
        updated_data = updated_data.replace(domain, domain_without_zone)
        
        # Extract subdomains
        pattern = r'(\S+)\s+IN\s+(A|CNAME)'
        matches = re.findall(pattern, data)
        
        for match in matches:
            subdomain = match[0]
            if not subdomain.endswith('.'):
                full_domain = f"{subdomain}.{domain_without_zone}"
            else:
                full_domain = subdomain
            result.append(full_domain.rstrip('.'))
    
    # Save the updated data back to the file
    with open(file_path, 'w') as file:
        file.write(updated_data)
    
    return result

subdomains = process_zone_file(file_path)
for subdomain in subdomains:
    print(subdomain)
