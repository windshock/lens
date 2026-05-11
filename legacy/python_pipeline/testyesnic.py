from bs4 import BeautifulSoup

html_content = """
<html>
<head>
    <link rel="stylesheet" type="text/css" href="/templates/yesnic/css/style.css?2309111">
    <link rel="stylesheet" type="text/css" media="(max-width:767px)" href="/templates/yesnic/css/style_m.css?2309111" />
    <link rel="stylesheet" type="text/css" media="(max-width:767px)" href="/templates/yesnic/css/style_m_table.css?23091" />
</head>
<body bgcolor="#ffffff" leftmargin="0" topmargin="0" marginwidth="0" marginheight="0">
    <div style="text-align:center">
        <div id="layer2" style="width:100%; z-index:10;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" align="center">
                <tr>
                    <td valign="top" align="center">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td width="5" bgcolor="#FFFFFF"></td>
                                <td valign="top" style="padding:5px;">
                                    <table width="100%" border="0" cellspacing="0" cellpadding="0" align="center">
                                        <tr>
                                            <td valign="top"
                                                style="padding:10px 0 10px 7px;color:#11abca;font-size:18px;font-weight:bold;">
                                                wezuro.co.kr<font style="color:#666">의 Whois 정보</font>
                                            </td>
                                            <td align="right"><input type="button" class="btn_white_s2" value="닫기" id="" onclick="parent.window.close()"></td>
                                        </tr>
                                        <tr>
                                            <td colspan="2" style="border:solid 1px #91b9c3; font-size:13px; padding:15px; color:#555; line-height:18px;">
                                                query : wezuro.co.kr<br><br><br>
                                                # KOREAN(UTF8)<br><br>
                                                도메인이름                  : wezuro.co.kr<br>
                                                등록인                      : 에스케이플래닛(주)<br>
                                                등록인 주소                 : 경기도 성남시 분당구 판교로 264 The Planet<br>
                                                등록인 우편번호             : 13487<br>
                                                책임자                      : 에스케이플래닛(주)<br>
                                                책임자 전자우편             : domain_skp@skplanet.com<br>
                                                책임자 전화번호             : +82.800116000<br>
                                                등록일                      : 2023. 05. 12.<br>
                                                최근 정보 변경일            : 2023. 05. 12.<br>
                                                사용 종료일                 : 2025. 05. 12.<br>
                                                정보공개여부                : Y<br>
                                                등록대행자                  : (주)가비아(http://www.gabia.co.kr)<br>
                                                DNSSEC                      : 미서명<br><br>
                                                1차 네임서버 정보<br>
                                                호스트이름               : ns1.skplanet.com<br><br>
                                                2차 네임서버 정보<br>
                                                호스트이름               : ns2.skplanet.com<br>
                                                호스트이름               : ns3.skplanet.com<br><br>
                                                네임서버 이름이 .kr이 아닌 경우는 IP주소가 보이지 않습니다.<br><br><br>
                                                # ENGLISH<br><br>
                                                Domain Name                 : wezuro.co.kr<br>
                                                Registrant                  : SK Planet Co. Ltd.<br>
                                                Registrant Address          : 264, Pangyo-ro, Bundang-gu, Seongnam-si, Gyeonggi-do, &nbsp;<br>
                                                Registrant Zip Code         : 13487<br>
                                                Administrative Contact(AC)  : SK Planet Co. Ltd.<br>
                                                AC E-Mail                   : domain_skp@skplanet.com<br>
                                                AC Phone Number             : +82.800116000<br>
                                                Registered Date             : 2023. 05. 12.<br>
                                                Last Updated Date           : 2023. 05. 12.<br>
                                                Expiration Date             : 2025. 05. 12.<br>
                                                Publishes                   : Y<br>
                                                Authorized Agency           : Gabia, Inc.(http://www.gabia.co.kr)<br>
                                                DNSSEC                      : unsigned<br><br>
                                                Primary Name Server<br>
                                                Host Name                : ns1.skplanet.com<br><br>
                                                Secondary Name Server<br>
                                                Host Name                : ns2.skplanet.com<br>
                                                Host Name                : ns3.skplanet.com<br><br><br>
                                                - KISA/KRNIC WHOIS Service -<br><br>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                                <td bgcolor="#FFFFFF"></td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
    </div>
</body>
</html>
"""

# Parse HTML content
soup = BeautifulSoup(html_content, 'html.parser')

# Find the section containing WHOIS information
whois_info_section = soup.find('td', style='border:solid 1px #91b9c3; font-size:13px; padding:15px; color:#555; line-height:18px;')

if whois_info_section:
    # Extract text from the section
    whois_info = whois_info_section.get_text()
    print(whois_info)
else:
    print("WHOIS information not found.")
