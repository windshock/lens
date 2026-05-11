import re

# WHOIS information
whois_info = '''
Domain Name: csb.app
Registry Domain ID: 2CA523788-APP
Registrar WHOIS Server: whois.namecheap.com
Registrar URL: https://www.namecheap.com/
Updated Date: 2022-06-15T08:46:31Z
Creation Date: 2018-05-08T16:00:02Z
Registry Expiry Date: 2027-05-08T16:00:02Z
Registrar: Namecheap Inc.
Registrar IANA ID: 1068
Registrar Abuse Contact Email: abuse@namecheap.com
Registrar Abuse Contact Phone: +1.6613102107
Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited
Registry Registrant ID: REDACTED FOR PRIVACY
Registrant Name: REDACTED FOR PRIVACY
Registrant Organization: Privacy service provided by Withheld for Privacy ehf
Registrant Street: REDACTED FOR PRIVACY
Registrant City: REDACTED FOR PRIVACY
Registrant State/Province: Capital Region
Registrant Postal Code: REDACTED FOR PRIVACY
Registrant Country: IS
Registrant Phone: REDACTED FOR PRIVACY
Registrant Email: Please query the WHOIS server of the owning registrar identified in this output for information on how to contact the Registrant, Admin, or Tech contact of the queried domain name. 
Registry Admin ID: REDACTED FOR PRIVACY
Admin Name: REDACTED FOR PRIVACY
Admin Organization: REDACTED FOR PRIVACY
Admin Street: REDACTED FOR PRIVACY
Admin City: REDACTED FOR PRIVACY
Admin State/Province: REDACTED FOR PRIVACY
Admin Postal Code: REDACTED FOR PRIVACY
Admin Country: REDACTED FOR PRIVACY
Admin Phone: REDACTED FOR PRIVACY
Admin Email: Please query the WHOIS server of the owning registrar identified in this output for information on how to contact the Registrant, Admin, or Tech contact of the queried domain name. 
Registry Tech ID: REDACTED FOR PRIVACY
Tech Name: REDACTED FOR PRIVACY
Tech Organization: REDACTED FOR PRIVACY
Tech Street: REDACTED FOR PRIVACY
Tech City: REDACTED FOR PRIVACY
Tech State/Province: REDACTED FOR PRIVACY
Tech Postal Code: REDACTED FOR PRIVACY
Tech Country: REDACTED FOR PRIVACY
Tech Phone: REDACTED FOR PRIVACY
Tech Email: Please query the WHOIS server of the owning registrar identified in this output for information on how to contact the Registrant, Admin, or Tech contact of the queried domain name. 
Registry Billing ID: REDACTED FOR PRIVACY
Billing Name: REDACTED FOR PRIVACY
Billing Organization: REDACTED FOR PRIVACY
Billing Street: REDACTED FOR PRIVACY
Billing City: REDACTED FOR PRIVACY
Billing State/Province: REDACTED FOR PRIVACY
Billing Postal Code: REDACTED FOR PRIVACY
Billing Country: REDACTED FOR PRIVACY
Billing Phone: REDACTED FOR PRIVACY
Billing Email: Please query the WHOIS server of the owning registrar identified in this output for information on how to contact the Registrant, Admin, or Tech contact of the queried domain name. 
Name Server: adel.ns.cloudflare.com
Name Server: greg.ns.cloudflare.com
DNSSEC: unsigned
URL of the ICANN Whois Inaccuracy Complaint Form: https://www.icann.org/wicf/
>>> Last update of WHOIS database: 2024-07-02T23:24:28Z <<<

For more information on Whois status codes, please visit https://icann.org/epp

Please query the WHOIS server of the owning registrar identified in this
output for information on how to contact the Registrant, Admin, or Tech
contact of the queried domain name.

You may also request underlying Registrant data via ICANN's RDRS service
(https://rdrs.icann.org/).

WHOIS information is provided by Charleston Road Registry Inc. (CRR) solely
for query-based, informational purposes. By querying our WHOIS database, you
are agreeing to comply with these terms
(https://www.registry.google/about/whois-disclaimer.html) and acknowledge
that your information will be used in accordance with CRR's Privacy Policy
(https://www.registry.google/about/privacy.html), so please read those
documents carefully.  Any information provided is "as is" without any
guarantee of accuracy. You may not use such information to (a) allow,
enable, or otherwise support the transmission of mass unsolicited,
commercial advertising or solicitations; (b) enable high volume, automated,
electronic processes that access the systems of CRR or any ICANN-Accredited
Registrar, except as reasonably necessary to register domain names or modify
existing registrations; or (c) engage in or support unlawful behavior. CRR
reserves the right to restrict or deny your access to the Whois database,
and may modify these terms at any time.
'''

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

# Printing the data on one line with placeholders for empty fields
print(f"Domain Name: {whois_data['Domain Name']}, Registrar: {whois_data['Registrar']}, Updated Date: {whois_data['Updated Date']}, Creation Date: {whois_data['Creation Date']}, Expiry Date: {whois_data['Expiry Date']}, Name Servers: {whois_data['Name Servers']}, Contact Email: {whois_data['Contact Email']}")
