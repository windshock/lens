from furl import furl
import tldextract as tld
import urllib.parse


def print_item(arr, name):
    for item in arr:
        print(f"{name} : {item}")


def check_tld(origin):
    return tld.extract(origin).domain


def check_furl(origin):
    return furl(origin).host


def check_urllib(origin):
    return urllib.parse.urlparse(origin).netloc


arr = [
    "http://test.education.github.com",
    "http://docs.github.com",
    "http://maps.naver.com",
    "http://github.com/onaeonae1",
    "http://onaeonae1.tistory.com",
    "http://forums.news.cnn.com",
]

print_item(list(map(check_tld, arr)), "tld")
print_item(list(map(check_furl, arr)), "furl")
print_item(list(map(check_urllib, arr)), "urllib")
