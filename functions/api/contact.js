// Cloudflare Pages Function, route POST /api/contact.
// Requires RESEND_API_KEY and RESEND_FROM_EMAIL environment variables.
// Optional CONTACT_TO_EMAIL defaults to the user's business address.
const MAX_BYTES=16000;
const VALID_NEEDS=new Set([
  'Préparation physique professionnelle','Réveil musculaire','Prévention des TMS',
  'Formation de relais internes','Accompagnement global','Autre'
]);
const reply=(status,data)=>new Response(JSON.stringify(data),{
  status,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const trim=(v,max=5000)=> typeof v==='string' ? v.trim().slice(0,max) : '';
const emailRE=/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;

export async function onRequestPost({request,env}){
  try {
    const contentType=request.headers.get('content-type')||'';
    if (!contentType.toLowerCase().includes('application/json')) return reply(415,{ok:false,message:'Format de demande invalide.'});
    if (Number(request.headers.get('content-length')||0)>MAX_BYTES) return reply(413,{ok:false,message:'Demande trop volumineuse.'});
    const raw=await request.text();
    if (raw.length>MAX_BYTES) return reply(413,{ok:false,message:'Demande trop volumineuse.'});
    let data;
    try { data=JSON.parse(raw); } catch { return reply(400,{ok:false,message:'Demande illisible.'}); }
    if (!data || typeof data!=='object' || Array.isArray(data)) return reply(400,{ok:false,message:'Demande invalide.'});
    // Invisible field helps ignore automated spam; do not generate an email.
    if (trim(data.website,256)) return reply(200,{ok:true});
    const name=trim(data.name,150),company=trim(data.company,150),email=trim(data.email,254);
    const phone=trim(data.phone,40), need=trim(data.need,100),message=trim(data.message,5000);
    if (!name || !emailRE.test(email) || data.consent!==true || !VALID_NEEDS.has(need))
      return reply(400,{ok:false,message:'Merci de renseigner votre nom, une adresse e-mail valide et votre consentement.'});
    if (/\r|\n/.test(email)) return reply(400,{ok:false,message:'Adresse e-mail invalide.'});
    if (!env?.RESEND_API_KEY || !env?.RESEND_FROM_EMAIL)
      return reply(503,{ok:false,message:'Le formulaire est en cours d’activation. Vous pouvez nous contacter par e-mail.'});
    const recipient=trim(env.CONTACT_TO_EMAIL || 'contact@mvt-solutions.fr',254);
    if (!emailRE.test(recipient)) return reply(503,{ok:false,message:'Configuration e-mail indisponible.'});
    const subject='Demande site MVT – Préparation physique professionnelle';
    const body=[
      'Nouvelle demande depuis la landing page Terrain (MVT-Solutions)',
      '', 'Nom : '+name,'Entreprise : '+(company||'Non renseignée'),
      'E-mail : '+email,'Téléphone : '+(phone||'Non renseigné'),
      'Besoin : '+need,'', 'Contexte :',message || 'Non renseigné',
      '', 'Consentement pour répondre à la demande : oui'
    ].join('\n');
    let send;
    try {
      send=await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({
          from:env.RESEND_FROM_EMAIL,to:[recipient],reply_to:email,
          subject,text:body
        })
      });
    } catch { return reply(502,{ok:false,message:'Le service e-mail est momentanément indisponible.'}); }
    if (!send.ok) {
      // Do not return provider errors or credentials to the visitor.
      return reply(502,{ok:false,message:'L’envoi n’a pas abouti. Merci de nous contacter par e-mail.'});
    }
    return reply(200,{ok:true});
  } catch {
    return reply(500,{ok:false,message:'Une erreur est survenue. Merci de réessayer.'});
  }
}

export function onRequestGet(){
  return reply(405,{ok:false,message:'Méthode non autorisée.'});
}
