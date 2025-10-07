import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// Use existing initialized instances
import { db, storage } from '../firebase';

type Item = {
  id: string;
  title?: string;
  itemUrl?: string;
  remoteImageUrl?: string;
  roomId?: string;
  exhibitionId?: string;
};

export default function AdminImport(){
  const [jsonText, setJsonText] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [exhibitionId, setExhibitionId] = useState('ng-1');
  const [roomId, setRoomId] = useState('1');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  // db, storage imported

  function appendLog(s: string){ setLog(prev => [...prev, s]); }

  const parse = () => {
    try{
      const parsed = JSON.parse(jsonText);
      const arr = Array.isArray(parsed) ? parsed : (parsed.items || []);
      const norm: Item[] = arr.map((it: any) => ({
        id: it.id || it.slug,
        title: it.title,
        itemUrl: it.itemUrl,
        remoteImageUrl: it.remoteImageUrl || it.image || it.ogImage,
      })).filter((it: Item) => it.id);
      setItems(norm);
    }catch(e:any){ alert('JSON 파싱 오류: ' + e.message); }
  };

  const onUpload = async () => {
    setBusy(true); setLog([]);
    try{
      for (const it of items){
        const id = it.id;
        await setDoc(doc(db, 'artworks', id), {
          id,
          name: it.title || id,
          image: it.remoteImageUrl || it.itemUrl,
          thumbnails: {},
          roomId,
          exhibitionTitle: exhibitionId,
          exhibitionId,
          sourceUrl: it.itemUrl,
          createdAt: serverTimestamp(),
        }, { merge: true });
        appendLog(`saved doc: ${id}`);
      }
      appendLog('모든 문서 저장 완료');
    }catch(e:any){ appendLog('오류: ' + e.message); }
    setBusy(false);
  };

  const onFileThumbs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    setBusy(true);
    try{
      for (const file of Array.from(files)){
        const base = file.name.replace(/\.[^.]+$/, '');
        const item = items.find(x => x.id === base);
        const id = item?.id || base;
        const storagePath = `paintings/${exhibitionId}/thumbs/${id}-${Date.now()}`;
        const r = ref(storage, storagePath);
        await uploadBytes(r, file);
        const url = await getDownloadURL(r);
        await setDoc(doc(db, 'artworks', id), { thumbnails: { small: url } }, { merge: true });
        appendLog(`uploaded thumb for: ${id}`);
      }
    }catch(e:any){ appendLog('thumb upload error: ' + e.message); }
    setBusy(false);
  };

  // Auto-import via postMessage from bookmarklet
  React.useEffect(() => {
    function onMsg(ev: MessageEvent){
      const d: any = ev.data;
      if (!d || d.type !== 'NG_IMPORT' || !d.payload) return;
      // Accept from any origin for now; could restrict in production
      const payload = d.payload as { room?: string; items?: any[] };
      try{
        const rid = (payload.room || roomId);
        setRoomId(rid.toString());
        const text = JSON.stringify({ items: payload.items || [] }, null, 2);
        setJsonText(text);
        // Auto-parse and auto-upload if hash is #auto
        const isAuto = window.location.hash === '#auto';
        if (isAuto){
          setTimeout(() => {
            try{ (document.getElementById('btn-parse') as HTMLButtonElement)?.click(); }catch{}
            setTimeout(() => { (document.getElementById('btn-upload') as HTMLButtonElement)?.click(); }, 300);
          }, 200);
        }
        appendLog(`received ${payload.items?.length || 0} items via postMessage`);
      }catch(e:any){ appendLog('postMessage error: ' + e.message); }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [roomId]);

  // Generate bookmarklet code for given roomId
  const bookmarklet = React.useMemo(() => {
    const origin = window.location.origin;
    const R = roomId || '1';
    const code = `javascript:(function(){var R='${R}';var collect=async function(){var anchors=[].slice.call(document.querySelectorAll('a[href*="/paintings/"]'));var seen={};var items=[];for(var i=0;i<anchors.length;i++){var a=anchors[i];var href=a.getAttribute('href');if(!href)continue;if(href.indexOf('http')!==0)href=location.origin+href;href=href.split('#')[0];if(seen[href])continue;seen[href]=1;var img=a.querySelector('img');var thumb=img?(img.src||img.getAttribute('data-src')):null;var title=a.getAttribute('title')||(img&&img.alt)||a.textContent.trim();items.push({href:href,thumb:thumb,title:title});}var out=[];for(let it of items){try{var res=await fetch(it.href,{credentials:'include'});var html=await res.text();var doc=new DOMParser().parseFromString(html,'text/html');var og=doc.querySelector('meta[property=\\"og:image\\"]');var ogImage=og&&og.getAttribute('content');var ogTitle=(doc.querySelector('meta[property=\\"og:title\\"]')||{}).content||'';var maker=doc.querySelector('[itemprop=\\"creator\\"]');var artist=maker&&maker.textContent.trim()||'';var slug=it.href.split('/paintings/')[1];if(slug)slug=slug.replace(/\\/$/,'');out.push({id:slug||('room'+R+'-'+Math.random().toString(36).slice(2,8)),title:it.title||ogTitle,artist:artist,itemUrl:it.href,remoteImageUrl:ogImage,roomId:R});}catch(e){}}var payload={room:R,source:location.href,items:out};var w=window.open('${origin}/admin/import#auto','_blank');var send=function(){try{w.postMessage({type:'NG_IMPORT',payload:payload},'${origin}');}catch(e){}};var t=setInterval(send,500);setTimeout(function(){clearInterval(t);},5000);};collect();})();`;
    return code;
  }, [roomId]);

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h2>Admin Import (링크 기반)</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
  <label htmlFor="exhibition-id">Exhibition ID: </label>
  <input id="exhibition-id" name="exhibitionId" value={exhibitionId} onChange={e=>setExhibitionId(e.target.value)} style={{ width: 140 }} />
  <label htmlFor="room-id" style={{ marginLeft: 8 }}>Room ID: </label>
  <input id="room-id" name="roomId" value={roomId} onChange={e=>setRoomId(e.target.value)} style={{ width: 80 }} />
        <button id="btn-parse" onClick={parse}>미리보기</button>
        <button id="btn-upload" onClick={onUpload} disabled={busy || items.length===0}>문서 저장</button>
        <label htmlFor="thumb-upload" style={{ marginLeft: 'auto' }}>썸네일 업로드(선택): </label>
        <input id="thumb-upload" name="thumbnailFiles" type="file" multiple accept="image/*" onChange={onFileThumbs} />
      </div>
      <div style={{ margin: '8px 0', padding: 8, background: '#f6f6f6' }}>
        <div style={{ marginBottom: 4 }}>북마클릿: 아래 링크를 즐겨찾기바에 드래그하세요. 해당 룸 페이지에서 클릭하면 자동으로 이 페이지로 전송/저장됩니다.</div>
        <a href={bookmarklet} style={{ color: '#0066cc', textDecoration: 'underline' }}>NG → Import (현재 Room {roomId})</a>
      </div>
  <label htmlFor="json-input" style={{ display: 'block', marginTop: 8, fontWeight: 600 }}>JSON 입력</label>
  <textarea id="json-input" name="jsonInput" value={jsonText} onChange={e=>setJsonText(e.target.value)} placeholder="[{ id, title, itemUrl, remoteImageUrl }] 또는 { items: [...] }" style={{ width: '100%', height: 160 }} />
      <div style={{ marginTop: 12 }}>
        <strong>항목 {items.length}개</strong>
        <ul>
          {items.map(it => (
            <li key={it.id} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>
              <div><b>{it.id}</b> — {it.title || ''}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{it.remoteImageUrl || it.itemUrl}</div>
            </li>
          ))}
        </ul>
      </div>
      {log.length>0 && (
        <div style={{ marginTop: 12, background: '#fafafa', padding: 8 }}>
          <div><b>로그</b></div>
          {log.map((l,i)=>(<div key={i} style={{ fontFamily: 'monospace', fontSize: 12 }}>{l}</div>))}
        </div>
      )}
    </div>
  );
}
