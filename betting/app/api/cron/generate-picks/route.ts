import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ================= SETTINGS =================
const ODDS_API_KEY = process.env.ODDS_API_KEY!;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports';

const ALLOWED_BOOKS = new Set([
  'fanduel','draftkings','betmgm','caesars','espnbet','betrivers','fanatics','thescorebet',
]);

const SPORTS = ['baseball_mlb','basketball_nba','icehockey_nhl'];

const MIN_BOOKS = 1;
const MIN_CONSENSUS_BOOKS = 1;

const MIN_EDGE_BY_MARKET = {
  moneyline: 0.05,
  spread: 0.05,
  total: 0.05,
};

const MIN_EV_BY_MARKET = {
  moneyline: 0.05,
  spread: 0.05,
  total: 0.05,
};

const MAX_PICKS_PER_RUN = 12;
const ONE_PICK_PER_GAME = true;

const LOOKAHEAD_HOURS = 36;
const MIN_MINUTES_TO_START = 5;

const MAX_PICKS_PER_MARKET = {
  moneyline: 3,
  spread: 5,
  total: 5,
};

// ================= HELPERS =================
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const prob = (o:number)=> o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);
const american = (p:number)=> p>=0.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p);
const dec = (o:number)=> o>0?1+o/100:1+100/Math.abs(o);
const ev = (p:number,o:number)=> (p*dec(o)-1)*100;

function removeVig(a:number,b:number){
  const t=a+b; return {a:a/t,b:b/t};
}

function isWindow(t:string){
  const now=Date.now();
  const start=new Date(t).getTime();
  return (start-now)/36e5 <= LOOKAHEAD_HOURS && (start-now)/60000 >= MIN_MINUTES_TO_START;
}

// ================= RATING =================
function getPlayRating(
  edge:number,
  evv:number,
  favorable:boolean,
  market:'moneyline'|'spread'|'total'
){
  if(market==='moneyline'){
    if(edge>=5 && evv>=8 && favorable) return 'MAX';
    if(edge>=3.5 && evv>=5) return 'A';
    if(edge>=2.25 && evv>=3) return 'B';
    if(edge>=0.05 && evv>=0.05) return 'C';
    return null;
  }

  if(edge>=3 && evv>=4.5 && favorable) return 'MAX';
  if(edge>=1.5 && evv>=2) return 'A';
  if(edge>=0.75 && evv>=0.85) return 'B';
  if(edge>=0.05 && evv>=0.05) return 'C';

  return null;
}

// ================= MAIN =================
export async function GET() {
  try {
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    let eventsChecked=0;
    let candidatesFound=0;

    const builderDebug = {
      moneylineBuilt:0,
      spreadBuilt:0,
      totalBuilt:0
    };

    const all:any[] = [];

    for(const sport of SPORTS){
      const url=`${ODDS_API_BASE}/${sport}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
      const events = await fetch(url).then(r=>r.json());

      for(const e of events){
        if(!isWindow(e.commence_time)) continue;
        if(!e.bookmakers?.length) continue;

        eventsChecked++;

        const sides:any={};

        for(const b of e.bookmakers){
          if(!ALLOWED_BOOKS.has(b.key)) continue;

          const h2h=b.markets?.find((m:any)=>m.key==='h2h');
          if(!h2h) continue;

          for(const o of h2h.outcomes){
            if(!sides[o.name]) sides[o.name]=[];
            sides[o.name].push(o.price);
          }
        }

        const teams=Object.keys(sides);
        if(teams.length!==2) continue;

        for(const t of teams){
          const opp=teams.find(x=>x!==t)!;

          const best = Math.max(...sides[t]);
          const pA = sides[t].reduce((s:number,x:number)=>s+prob(x),0)/sides[t].length;
          const pB = sides[opp].reduce((s:number,x:number)=>s+prob(x),0)/sides[opp].length;

          const {a} = removeVig(pA,pB);

          const implied = prob(best);
          const edge = (a-implied)*100;
          const evv = ev(a,best);

          const rating = getPlayRating(edge,evv,true,'moneyline');
          if(!rating) continue;

          builderDebug.moneylineBuilt++;

          all.push({
            sport:sport.toUpperCase(),
            game:`${e.away_team} at ${e.home_team}`,
            pick:`${t} ML`,
            odds:best,
            confidence:Math.round(a*100),
            analysis:`Edge ${edge.toFixed(2)} EV ${evv.toFixed(2)}`,
            stake: rating==='MAX'?2:1,
            result:'pending',
            sportsbook:'market',
            status:'pregame',
            commence_time:e.commence_time,
            market_type:'moneyline',
            edge,
            ev:evv,
            play_rating:rating,
            max_play: rating==='MAX',
            is_live:false,
            event_id:e.id,
            odds_last_seen_at:nowIso
          });

          candidatesFound++;
        }
      }
    }

    if(!all.length){
      return NextResponse.json({
        success:true,
        inserted:0,
        message:'No qualifying pregame picks found.',
        debug:{eventsChecked,candidatesFound,builderDebug}
      });
    }

    const final = all.slice(0,MAX_PICKS_PER_RUN);

    await supabase.from('picks').delete().eq('status','pregame');
    const {data,error} = await supabase.from('picks').insert(final).select();

    if(error){
      return NextResponse.json({success:false,error:error.message});
    }

    return NextResponse.json({
      success:true,
      inserted:data?.length||0,
      picks:data,
      debug:{eventsChecked,candidatesFound,builderDebug}
    });

  } catch(e:any){
    return NextResponse.json({success:false,error:e.message});
  }
}
