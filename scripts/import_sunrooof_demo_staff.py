"""Import a local, read-only Zoho staff snapshot into the disposable demo only.
No credentials, live Zoho writes or staff login provisioning.
"""
import json, os, sqlite3, sys
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from sqlalchemy import create_engine, select, update
from backend.models import state, credentials

def main():
    path=ROOT/'.local/sunroof-qa/test-only.db'
    source=ROOT/'.local/zoho-staff-2026-11-13'
    if os.environ.get('VERCEL') or os.environ.get('CRM_ENV','development')!='development' or not path.is_file():
        raise SystemExit('Requires the existing disposable local demo database.')
    snapshot=json.loads((source/'users.json').read_text())
    if not snapshot.get('complete'): raise SystemExit('Incomplete source; refusing import.')
    fields=json.loads((source/'role-fields.json').read_text())
    visit_names=next(f['names'] for f in fields if f['module']=='Orders_V2' and f['field']=='Aligned_Person1')
    people=[]
    for u in snapshot['users']:
        group={'Designers':'design','Installation Managers':'installation','Factory Head':'factory-head'}.get(u['role'])
        if u['id']=='887064000009635003': group='design-head'
        if not group: continue
        person={'id':u['id'],'name':u['name'],'group':group,'sourceRole':u['role'],'status':u['status']}
        if group=='design-head': person['note']='Design Head confirmed in workflow discussion.'
        if group=='factory-head' and u['status']=='active': person['note']='Zoho lists Ranjay; workflow provisionally names Chitranjan. Confirm ownership.'
        people.append(person)
    active=[p for p in people if p['status']=='active']
    assert len([p for p in active if p['group']=='design'])==7
    assert len([p for p in active if p['group']=='installation'])==10
    backup=path.with_name('before-staff-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'.db')
    with sqlite3.connect(path) as src, sqlite3.connect(backup) as dest: src.backup(dest)
    backup.chmod(0o600)
    engine=create_engine('sqlite:///'+str(path))
    with engine.begin() as db:
        if not db.scalar(select(credentials.c.user_id).where(credentials.c.email=='qa@sunroof.local')):
            raise SystemExit('Missing demo guard account.')
        row=db.execute(select(state)).mappings().one(); payload=row['payload']; data=payload['sunroof']
        if not data.get('demo'): raise SystemExit('Not a demo workspace.')
        data['directory']={'fetchedAt':'13 Nov 2026','people':people,'visitNames':[n for n in visit_names if n not in ('-None-','By Other')]}
        designers=[{'id':'zoho-'+p['id'],'name':p['name'],'location':'','payGrade':'To confirm','source':'zoho-reference'} for p in active if p['group']=='design']
        workers=[{'id':'zoho-'+p['id'],'name':p['name'],'location':'','kind':'installation_manager','source':'zoho-reference'} for p in active if p['group']=='installation']
        mapping={'demo-designer-1':'zoho-887064000011716029','demo-designer-2':'zoho-887064000011831001','demo-im':'zoho-887064000020507001'}
        for o in data['orders']:
            if o.get('source')=='demo':
                o['designerId']=mapping.get(o.get('designerId'),o.get('designerId'))
                for v in o.get('visits',[]): v['workerId']=mapping.get(v['workerId'],v['workerId'])
        for m in data['members']:
            if m['userId'].startswith('sunroof-demo-'): m['staffId']=mapping.get(m['staffId'],m['staffId'])
        for key,rows in [('designers',designers),('workers',workers)]:
            existing={p['id']:p for p in data[key] if p['id'] not in mapping}
            for p in rows: existing[p['id']]=p
            data[key]=list(existing.values())
        db.execute(update(state).where(state.c.id==row['id']).values(payload=payload,rev=row['rev']+1))
    # Human-readable reference, no credentials or personal contact details.
    lines=['# Sunrooof staff reference','', 'Read-only Zoho lookup: 13 November 2026. All 83 user records paginated successfully.','', '7 active designers, 10 active installation managers, Shivang Sharma (Design Head per discussion; Zoho Post Sales Head), Ranjay (Zoho Factory Head).','', '## Unresolved mappings','', '- Chitranjan is the provisional factory/production/QC owner in the discussion; Zoho lists Ranjay. No production ownership was changed.','- No explicit Measurement Executive role. Visit-assignee picklist names are references only: '+', '.join(data['directory']['visitNames'])+'.','- Staff locations and square-footage/pay-grade capacities were not populated in Zoho.','- Demo assignments are fictional. This import does not create logins or update Zoho.','', '## Relevant Zoho users','', '| Name | Group | Zoho role | Status |','|---|---|---|---|']
    lines += ['| '+ ' | '.join(p[k] for k in ('name','group','sourceRole','status'))+' |' for p in people]
    (ROOT/'docs/SUNROOOF-STAFF-REFERENCE.md').write_text('\n'.join(lines)+'\n')
    print('Imported 7 active designers, 10 installation managers and 2 head references; retained inactive staff as directory references only.')
if __name__=='__main__': main()
