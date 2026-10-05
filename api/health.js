export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  return res.status(200).json({ok:true,market:'binance-usdm',time:Date.now()});
}
