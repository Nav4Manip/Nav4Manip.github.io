(() => {
 const button=document.getElementById('copy-citation');
 const status=document.getElementById('citation-status');
 button.addEventListener('click',async()=>{
  const text=document.getElementById('citation-text').textContent;
  try {
   if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
   else {const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();button.focus();if(!ok)throw Error('Copy failed');}
   button.textContent='Copied!';status.textContent='Citation copied.';
   setTimeout(()=>{button.textContent='Copy';status.textContent='';},2000);
  } catch {status.textContent='Copy failed. Select the citation and copy it manually.';}
 });
})();
