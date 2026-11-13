"""Add labelled sample orders and scoped demo logins to the disposable local QA database only.
No Zoho calls. No opportunity/order creation API. Never use this for production data.
"""
import os, sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from sqlalchemy import create_engine, select, update, insert
from backend.models import state, users, credentials

def main():
    path = ROOT / '.local/sunroof-qa/test-only.db'
    if os.environ.get('VERCEL') or os.environ.get('CRM_ENV', 'development') != 'development' or not path.is_file():
        raise SystemExit('Refused: requires the existing disposable local QA database.')
    engine = create_engine('sqlite:///' + str(path))
    stamp = datetime.now(timezone.utc).isoformat()
    start = (datetime.now(timezone.utc)+timedelta(days=1)).replace(hour=5,minute=0,second=0,microsecond=0)
    with engine.begin() as db:
        qa_hash = db.scalar(select(credentials.c.password_hash).where(credentials.c.email == 'qa@sunroof.local'))
        if not qa_hash: raise SystemExit('Refused: isolated QA account is missing.')
        row = db.execute(select(state)).mappings().one(); payload = row['payload']; data = payload.setdefault('sunroof', {})
        for key in ('orders','designers','workers','members'): data.setdefault(key, [])
        data['demo'] = True
        designers = [{'id':'demo-designer-1','name':'Demo Designer A','location':'Delhi','payGrade':'To confirm'}, {'id':'demo-designer-2','name':'Demo Designer B','location':'Mumbai','payGrade':'To confirm'}]
        workers = [{'id':'demo-executive','name':'Demo Measurement Executive','location':'Delhi','kind':'executive'},{'id':'demo-im','name':'Demo Installation Manager','location':'Delhi','kind':'installation_manager'}]
        for key, rows in [('designers',designers),('workers',workers)]:
            data[key].extend(x for x in rows if x['id'] not in {y['id'] for y in data[key]})
        specs=[('atrium','Demo Atrium','measurement','demo-designer-1'),('courtyard','Demo Courtyard','measurement','demo-designer-1'),('pavilion','Demo Pavilion','drawings','demo-designer-2'),('terrace','Demo Terrace','handover','demo-designer-1'),('studio','Demo Studio','qc','demo-designer-2'),('orchid','Demo Orchid','assignment','')]
        for index,(suffix,name,stage,designer) in enumerate(specs):
            oid='demo-'+suffix
            if any(o['id']==oid for o in data['orders']): continue
            order={'id':oid,'source':'demo','reference':'DEMO-'+str(index+1).zfill(3),'client':name,'location':'Mumbai' if designer=='demo-designer-2' else 'Delhi','squareFeet':240+index*80,'designerId':designer,'models':[{'code':'DEMO-MODEL-A','quantity':2},{'code':'DEMO-MODEL-B','quantity':1}],'stage':stage,'createdAt':stamp,'history':[{'at':stamp,'by':'demo-seed','text':'Sample booked order supplied for departmental demonstration'}],'dues':{'production':12500000,'dispatch':5000000},'receipts':[],'visits':[]}
            if suffix=='courtyard': order['visits']=[{'id':'demo-visit-im','kind':'measurement','workerId':'demo-im','start':start.isoformat(),'end':(start+timedelta(hours=2)).isoformat(),'status':'pending','checklist':[],'documents':[]}]
            if suffix=='pavilion': order['receipts']=[{'id':'demo-payment-1','amount':2500000,'reference':'DEMO-BANK-REFERENCE','milestone':'production','status':'requested','submittedAt':stamp}]
            if suffix in ('terrace','studio'):
                order['dues']['production']=0;order['clientApproved']=True
                order['history'].append({'at':stamp,'by':'demo-seed','text':'Sample snapshot starts after factory handover; no live client approval or file generation is implied'})
            if suffix=='studio': order['factoryAccepted']=stamp;order['productionStartedAt']=stamp;order['productionCompletedAt']=stamp
            data['orders'].append(order)
        for dept,staff in [('design','demo-designer-1'),('design-head',''),('measurement','demo-executive'),('accounts',''),('factory','')]:
            uid='sunroof-demo-'+dept; email=dept+'@sunroof.local'
            if not db.scalar(select(users.c.id).where(users.c.id==uid)):
                db.execute(insert(users).values(id=uid,role='assigned',active=1))
                db.execute(insert(credentials).values(user_id=uid,email=email,password_hash=qa_hash))
            if not any(m['userId']==uid for m in data['members']): data['members'].append({'userId':uid,'department':dept,'staffId':staff})
        db.execute(update(state).where(state.c.id==1,state.c.rev==row['rev']).values(payload=payload,rev=row['rev']+1))
    engine.dispose()
    print('Labelled demo orders and five scoped department logins are ready. QA password is unchanged; department demo logins use it too.')
if __name__ == '__main__': main()
