import re,sys,subprocess,os,tempfile
s=open(sys.argv[1],encoding='utf-8').read()
bad=0;n=0
for m in re.finditer(r'<script(\s[^>]*)?>(.*?)</script>',s,re.S):
    a=m.group(1) or ''
    if 'src=' in a or re.search(r'type=["\'](?!text/javascript|module)',a): continue
    n+=1
    f=tempfile.NamedTemporaryFile('w',suffix='.js',delete=False,encoding='utf-8'); f.write(m.group(2)); f.close()
    r=subprocess.run(['node','--check',f.name],capture_output=True,text=True); os.unlink(f.name)
    if r.returncode: bad+=1; print('BAD script #',n, a[:60], r.stderr[:300])
print('scripts',n,'bad',bad)
