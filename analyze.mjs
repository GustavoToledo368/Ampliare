const BRASIL_API = 'https://brasilapi.com.br/cnpj/v1/';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body)
});

function cleanCnpj(value = '') {
  return String(value).replace(/\D/g, '');
}

function validCnpj(value) {
  const d = cleanCnpj(value);
  if (d.length !== 14 || /^([0-9])\1{13}$/.test(d)) return false;
  let sum = 0, weight = 5;
  for (let i = 0; i < 12; i++) { sum += Number(d[i]) * weight; weight = weight === 2 ? 9 : weight - 1; }
  let r = sum % 11; const a = r < 2 ? 0 : 11 - r;
  if (a !== Number(d[12])) return false;
  sum = 0; weight = 6;
  for (let i = 0; i < 13; i++) { sum += Number(d[i]) * weight; weight = weight === 2 ? 9 : weight - 1; }
  r = sum % 11; const b = r < 2 ? 0 : 11 - r;
  return b === Number(d[13]);
}

function normalizeCompany(x) {
  const atividade = x.cnae_fiscal_descricao || x.cnae_fiscal_principal?.descricao || '';
  const city = x.municipio || '';
  return {
    cnpj: x.cnpj || '',
    company: x.razao_social || '',
    tradeName: x.nome_fantasia || x.razao_social || '',
    segment: atividade,
    status: x.descricao_situacao_cadastral || x.situacao_cadastral || '',
    size: x.porte || x.descricao_porte || '',
    opening: x.data_inicio_atividade || x.data_situacao_cadastral || '',
    phone: x.ddd_telefone_1 || x.ddd_telefone_2 || '',
    email: x.correio_eletronico || '',
    city: city ? `${city}${x.uf ? ' / ' + x.uf : ''}` : (x.uf || ''),
    address: [x.logradouro, x.numero, x.bairro, city, x.uf, x.cep].filter(Boolean).join(', ')
  };
}

async function getJson(url, options = {}) {
  const r = await fetch(url, { ...options, headers: { accept: 'application/json', ...(options.headers || {}) } });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { message: text.slice(0, 500) }; }
  if (!r.ok) throw new Error(data?.message || data?.error || `HTTP ${r.status}`);
  return data;
}

async function googleSearch(name) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const data = await getJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.businessStatus,places.types'
    },
    body: JSON.stringify({ textQuery: name, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 5 })
  });
  return data?.places?.[0] || null;
}

async function auditSite(url) {
  if (!url) return { found: false, reason: 'Site não identificado' };
  let u = url;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'AmpliareProspeccao/1.0' } });
    const html = await r.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || '').trim();
    const whatsapp = /wa\.me|api\.whatsapp\.com|whatsapp/i.test(html);
    const form = /<form\b/i.test(html);
    const viewport = /name=["']viewport["']/i.test(html);
    return { found: true, url: r.url, domain: new URL(r.url).hostname, status: r.status, https: r.url.startsWith('https://'), title, description, whatsapp, form, viewport };
  } catch (e) {
    return { found: false, url, reason: e.message || 'Não foi possível acessar o site' };
  }
}

function opportunities(company, digital) {
  const out = [];
  const w = digital.website;
  if (!w?.found) out.push('Site não identificado ou não acessível: oportunidade para criar ou melhorar uma página de conversão.');
  else {
    if (!w.https) out.push('Site sem HTTPS detectado no endereço final.');
    if (!w.title) out.push('Título da página não identificado: vale revisar SEO e clareza da oferta.');
    if (!w.description) out.push('Meta description não identificada: oportunidade de melhorar presença orgânica.');
    if (!w.viewport) out.push('Viewport não identificado: revisar experiência em celular.');
    if (!w.whatsapp && !w.form) out.push('Não foi encontrado formulário nem WhatsApp no HTML inicial: revisar captação de leads.');
  }
  if (!digital.google) out.push('Presença no Google não foi identificada pela integração atual.');
  else if ((digital.google.userRatingCount || 0) < 20) out.push('Perfil Google tem poucas avaliações para o potencial de prova social.');
  if (!out.length) out.push('Presença digital básica encontrada; oportunidade principal deve ser validada com métricas de tráfego e conversão.');
  return out.slice(0, 6);
}

function recommendation(company, digital) {
  const w = digital.website;
  if (!w?.found) return 'Estruturar presença digital e uma página de captação, seguida de campanha de tráfego pago local.';
  if (!w.whatsapp && !w.form) return 'Melhorar a conversão do site com CTA claro, WhatsApp/formulário e campanha de tráfego pago direcionada.';
  if (!w.https || !w.viewport) return 'Revisar a base técnica do site e depois escalar aquisição com campanhas segmentadas.';
  return 'Auditar campanhas, oferta e conversão e estruturar tráfego pago com acompanhamento de leads e remarketing.';
}

function outreach(company, digital, rec) {
  const name = company.tradeName || company.company || 'sua empresa';
  return {
    whatsapp: `Oi! Tudo bem? Sou da Ampliare Performance. Estava analisando a presença digital da ${name} e encontrei alguns pontos que podem estar deixando oportunidades na mesa.\n\nA principal oportunidade que identifiquei foi: ${digital.website?.found ? 'melhorar a conversão da presença digital' : 'fortalecer a presença digital e a captação de novos clientes'}.\n\nA gente trabalha justamente com tráfego pago e conversão. Se fizer sentido, posso te mostrar rapidamente o que eu identifiquei.`,
    email_subject: `Uma oportunidade que identifiquei na presença digital da ${name}`,
    email: `Olá!\n\nAnalisei rapidamente a presença digital da ${name} e identifiquei uma oportunidade relacionada a aquisição e conversão de clientes.\n\nMinha sugestão é ${rec.toLowerCase()}\n\nSe quiser, posso apresentar a análise em poucos minutos.\n\nAbraço,\nAmpliare Performance`,
    dm: `Oi! Vi a presença da ${name} e encontrei alguns pontos interessantes para melhorar a captação de clientes. Trabalho com tráfego pago na Ampliare Performance e posso te mostrar a análise rapidinho, se quiser.`
  };
}

export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const body = JSON.parse(request.body || '{}');
    const query = String(body.query || '').trim();
    if (!query) return json(400, { error: 'Informe um CNPJ ou nome de empresa.' });

    let company = null;
    let google = null;
    const cnpj = cleanCnpj(query);
    const looksLikeCnpj = /\d/.test(query) && cnpj.length >= 11;

    if (looksLikeCnpj) {
      if (!validCnpj(cnpj)) return json(400, { error: 'O CNPJ informado é inválido. Confira os 14 dígitos.' });
      const data = await getJson(`${BRASIL_API}${cnpj}`);
      company = normalizeCompany(data);
    } else {
      google = await googleSearch(query);
      if (!google) return json(400, { error: 'A pesquisa por nome precisa da integração Google Places. No Netlify, adicione GOOGLE_PLACES_API_KEY em Site configuration → Environment variables e publique novamente. Para CNPJ, a pesquisa funciona sem essa chave.' });
      company = {
        cnpj: '',
        company: google.displayName?.text || query,
        tradeName: google.displayName?.text || query,
        segment: (google.types || []).slice(0, 3).join(', '),
        status: google.businessStatus || 'Encontrada no Google',
        size: 'Não disponível',
        opening: 'Não disponível',
        phone: google.nationalPhoneNumber || '',
        email: '',
        city: google.formattedAddress || '',
        address: google.formattedAddress || ''
      };
    }

    if (!google && process.env.GOOGLE_PLACES_API_KEY) {
      try { google = await googleSearch(company.tradeName || company.company); } catch {}
    }

    const websiteUrl = google?.websiteUri || '';
    const website = await auditSite(websiteUrl);
    const digital = { google: google ? { rating: google.rating, userRatingCount: google.userRatingCount, website: google.websiteUri, phone: google.nationalPhoneNumber, address: google.formattedAddress } : null, website };
    const opps = opportunities(company, digital);
    const rec = recommendation(company, digital);
    const score = Math.max(45, Math.min(96, 52 + opps.length * 6 + (website.found ? 5 : 12)));

    return json(200, {
      company,
      digital,
      website,
      ads: { status: 'Não conectado', note: 'A ausência de conexão não significa que a empresa não anuncie.' },
      opportunities: opps,
      score,
      recommendation: rec,
      outreach: outreach(company, digital, rec),
      sources: { cnpj: company.cnpj ? 'BrasilAPI / Minha Receita' : 'Google Places' }
    });
  } catch (e) {
    return json(502, { error: `Não foi possível concluir a pesquisa agora: ${e.message || 'erro externo'}` });
  }
};
