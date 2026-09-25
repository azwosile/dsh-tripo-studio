export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法解码'))
    image.src = src
  })
}
export async function readImageFile(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 ** 2) throw new Error('请选择 20 MB 内的 PNG / JPEG / WebP')
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    if (image.width * image.height > 36000000 || Math.min(image.width, image.height) < 14) throw new Error('图片须至少 14×14，且不超过 3600 万像素')
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    canvas.getContext('2d').drawImage(image, 0, 0)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}
export function normalizeRect(rect) {
  const x = Math.max(0, Math.min(99, Number(rect.x) || 0)), y = Math.max(0, Math.min(99, Number(rect.y) || 0))
  return {x, y, w: Math.max(1, Math.min(100 - x, Number(rect.w) || 1)), h: Math.max(1, Math.min(100 - y, Number(rect.h) || 1))}
}
export async function cropImage(src, input, background = '#ffffff') {
  if (!/^#[0-9a-f]{6}$/i.test(background)) throw new Error('裁剪背景颜色无效')
  const image = await loadImage(src), r = normalizeRect(input)
  const sx = image.width * r.x / 100, sy = image.height * r.y / 100
  const sw = image.width * r.w / 100, sh = image.height * r.h / 100
  if (Math.min(sw, sh) < 14) throw new Error('裁剪区域太小，请扩大选区')
  // Square padding uses the chosen/sampled background; the source stays untouched.
  const side = Math.min(2048, Math.ceil(Math.max(sw, sh) * 1.12))
  const scale = side / (Math.max(sw, sh) * 1.12)
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = side
  const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, side, side)
  ctx.drawImage(image, sx, sy, sw, sh, (side - sw * scale) / 2, (side - sh * scale) / 2, sw * scale, sh * scale)
  return canvas.toDataURL('image/png')
}
// 0.2.12: user-confirmed limit for local candidates (was 12).
export const MAX_CROP_CANDIDATES=36
// Edge-seeded background removal is a LOCAL candidate finder, not semantic segmentation.
// Robust border medians handle mild gradients/anti-aliasing; 8-connectivity keeps
// diagonally touching pieces together. Users can correct every result with lasso.
export function detectRegions(data,w,h) {
  if (w<14||h<14||data.length<w*h*4) return []
  const n=w*h, border=[]
  const step=Math.max(1,Math.floor((w+h)*2/512))
  for(let x=0;x<w;x+=step){border.push(x,(h-1)*w+x)}
  for(let y=0;y<h;y+=step){border.push(y*w,y*w+w-1)}
  const opaque=border.filter(i=>data[i*4+3]>=64)
  const transparent=opaque.length<border.length*0.7
  const median=(values)=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]??255
  const bg=[0,1,2].map(c=>median(opaque.map(i=>data[i*4+c])))
  const diff=(i)=>Math.max(...bg.map((v,c)=>Math.abs(data[i*4+c]-v)))
  const borderSpread=median(opaque.map(diff)),tolerance=Math.min(65,Math.max(18,borderSpread*2+12))
  const isBg=i=>data[i*4+3]<64||(!transparent&&diff(i)<=tolerance)
  const background=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0
  const seed=i=>{if(!background[i]&&isBg(i)){background[i]=1;queue[tail++]=i}}
  for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x)}
  for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1)}
  while(head<tail){
    const p=queue[head++],x=p%w,y=(p/w)|0
    for(const q of [x?p-1:-1,x+1<w?p+1:-1,y?p-w:-1,y+1<h?p+w:-1])
      if(q>=0&&!background[q]&&isBg(q)){background[q]=1;queue[tail++]=q}
  }
  const mask=new Uint8Array(n),visited=new Uint8Array(n)
  for(let i=0;i<n;i++) if(!background[i]&&data[i*4+3]>=64)mask[i]=1
  // Remove isolated speckles without erasing slim but connected outlines.
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(!mask[i])continue
    let neighbours=0
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy)neighbours+=mask[i+dy*w+dx]
    if(neighbours<2)mask[i]=0
  }
  const found=[]
  for(let i=0;i<n;i++){
    if(!mask[i]||visited[i])continue
    head=0;tail=1;queue[0]=i;visited[i]=1
    let left=w,right=0,top=h,bottom=0
    while(head<tail){
      const p=queue[head++],x=p%w,y=(p/w)|0
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue
        const xx=x+dx,yy=y+dy,q=yy*w+xx
        if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[q]&&!visited[q]){visited[q]=1;queue[tail++]=q}
      }
    }
    if(tail<Math.max(40,n*0.0005)||right-left<5||bottom-top<5||tail>n*0.93)continue
    const x=Math.max(0,(left-2)/w*100),y=Math.max(0,(top-2)/h*100)
    const maxX=Math.min(100,(right+3)/w*100),maxY=Math.min(100,(bottom+3)/h*100)
    found.push({...normalizeRect({x,y,w:maxX-x,h:maxY-y}),area:tail})
  }
  return found.sort((a,b)=>b.area-a.area).slice(0,MAX_CROP_CANDIDATES).sort((a,b)=>a.y-b.y||a.x-b.x)
}
export async function detectParts(src) {
  const image=await loadImage(src),scale=Math.min(1,640/Math.max(image.width,image.height))
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale))
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height)
  return detectRegions(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height)
}
export async function cropPolygonImage(src,points,background='#ffffff') {
  if(!/^#[0-9a-f]{6}$/i.test(background))throw new Error('裁剪背景颜色无效')
  if(!Array.isArray(points)||points.length<3||points.length>1200||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>100||p.y<0||p.y>100))throw new Error('请沿区域边缘画出有效套索')
  const image=await loadImage(src)
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y)
  const sx=Math.min(...xs)/100*image.width,sy=Math.min(...ys)/100*image.height
  const sw=(Math.max(...xs)-Math.min(...xs))/100*image.width,sh=(Math.max(...ys)-Math.min(...ys))/100*image.height
  if(Math.min(sw,sh)<14)throw new Error('套索区域太小，请扩大选区')
  const side=Math.min(2048,Math.ceil(Math.max(sw,sh)*1.12)),scale=side/(Math.max(sw,sh)*1.12)
  const dx=(side-sw*scale)/2,dy=(side-sh*scale)/2
  const canvas=document.createElement('canvas');canvas.width=canvas.height=side
  const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,side,side)
  ctx.beginPath()
  points.forEach((p,i)=>{const x=dx+(p.x/100*image.width-sx)*scale,y=dy+(p.y/100*image.height-sy)*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y)})
  ctx.closePath();ctx.save();ctx.clip()
  ctx.drawImage(image,sx,sy,sw,sh,dx,dy,sw*scale,sh*scale)
  ctx.restore()
  return canvas.toDataURL('image/png')
}

export async function sampleImageColor(src, point) {
  const image = await loadImage(src)
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1
  const ctx=canvas.getContext('2d',{willReadFrequently:true})
  const x=Math.min(image.width-1,Math.max(0,Math.floor(point.x/100*image.width))),y=Math.min(image.height-1,Math.max(0,Math.floor(point.y/100*image.height)))
  ctx.drawImage(image,x,y,1,1,0,0,1,1)
  const rgba=ctx.getImageData(0,0,1,1).data
  // Composite transparent pixels over white; PNG padding remains opaque and predictable.
  return '#'+[0,1,2].map(i=>Math.round(rgba[i]*rgba[3]/255+255-rgba[3]).toString(16).padStart(2,'0')).join('')
}

// 0.2.12: Photoshop-style lasso composition. Each shape is {op:'add'|'subtract',points}.
// The first shape starts a selection; Shift adds (union) and Alt subtracts later shapes.
export function validSelection(shapes) {
  return Array.isArray(shapes)&&shapes.length>0&&shapes.length<=40&&shapes[0]?.op==='add'&&shapes.every(s=>['add','subtract'].includes(s?.op)&&Array.isArray(s.points)&&s.points.length>=3&&s.points.length<=1200&&s.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100))
}
export function selectionBounds(shapes) {
  const pts=shapes.filter(s=>s.op==='add').flatMap(s=>s.points)
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y)
  return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}
}
export async function cropSelectionImage(src,shapes,background='#ffffff') {
  if(!/^#[0-9a-f]{6}$/i.test(background))throw new Error('裁剪背景颜色无效')
  if(!validSelection(shapes))throw new Error('请沿区域边缘画出有效套索；Shift 添加、Alt 减去')
  const image=await loadImage(src),b=selectionBounds(shapes)
  const sx=b.x/100*image.width,sy=b.y/100*image.height,sw=b.w/100*image.width,sh=b.h/100*image.height
  if(Math.min(sw,sh)<14)throw new Error('套索区域太小，请扩大选区')
  const side=Math.min(2048,Math.ceil(Math.max(sw,sh)*1.12)),scale=side/(Math.max(sw,sh)*1.12)
  const dx=(side-sw*scale)/2,dy=(side-sh*scale)/2
  const path=points=>{const p=new Path2D();points.forEach((q,i)=>{const x=dx+(q.x/100*image.width-sx)*scale,y=dy+(q.y/100*image.height-sy)*scale;i?p.lineTo(x,y):p.moveTo(x,y)});p.closePath();return p}
  // Build an alpha mask in order, so add/subtract follow the user's drawing sequence.
  const mask=document.createElement('canvas');mask.width=mask.height=side
  const m=mask.getContext('2d');m.fillStyle='#000'
  for(const shape of shapes){m.globalCompositeOperation=shape.op==='add'?'source-over':'destination-out';m.fill(path(shape.points))}
  const cut=document.createElement('canvas');cut.width=cut.height=side
  const c=cut.getContext('2d');c.drawImage(image,sx,sy,sw,sh,dx,dy,sw*scale,sh*scale)
  c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0)
  const canvas=document.createElement('canvas');canvas.width=canvas.height=side
  const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,side,side);ctx.drawImage(cut,0,0)
  return canvas.toDataURL('image/png')
}
