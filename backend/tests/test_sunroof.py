from datetime import datetime, timedelta, timezone
from sqlalchemy import insert, update, select
from backend.tests.test_api import api, sign_in
from backend.models import state, users


def prepare(api):
    client, engine, _ = api
    with engine.begin() as db:
        payload = db.scalar(select(state.c.payload))
        for name in ('designer','other','worker','im','accounts','factory','head'):
            db.execute(insert(users).values(id=name, role='assigned', active=1))
        def order(id, designer='d1', stage='measurement'):
            return {'id':id,'reference':id,'client':'Synthetic '+id,'location':'Delhi','squareFeet':250,'designerId':designer,'models':[{'code':'A','quantity':2}],'stage':stage,'history':[], 'dues':{'production':100000,'dispatch':50000}}
        payload['sunroof'] = {'designers':[{'id':'d1','name':'Designer','location':'Delhi','payGrade':'A'},{'id':'d2','name':'Other','location':'Delhi','payGrade':'A'}], 'workers':[{'id':'w1','name':'Executive','kind':'executive','location':'Delhi'},{'id':'w2','name':'IM','kind':'installation_manager','location':'Delhi'}], 'members':[{'userId':uid,'department':dept,'staffId':staff} for uid,dept,staff in [('designer','design','d1'),('other','design','d2'),('worker','measurement','w1'),('im','measurement','w2'),('accounts','accounts',''),('factory','factory',''),('head','design-head','')]], 'orders':[order('one'),order('two','d2'),order('fac','d1','handover')]}
        db.execute(update(state).values(payload=payload))
    return client


def workspace(c): return c.get('/api/sunroof/workspace').json()
def post(c, path, **body): return c.post('/api/sunroof/'+path,json={'revision':workspace(c)['revision'], **body})
def slot():
    start = datetime.now(timezone.utc)+timedelta(days=2)
    return {'start':start.isoformat(),'end':(start+timedelta(hours=2)).isoformat()}


def test_personal_scopes_and_no_new_order_or_privilege_switch(api):
    c=prepare(api)
    assert c.get('/api/sunroof/workspace').status_code==401
    sign_in(c,'designer')
    assert {o['id'] for o in workspace(c)['orders']}=={'one','fac'}
    assert c.get('/api/sunroof/workspace?department=accounts').json()['department']=='design'
    assert post(c,'orders/two/receipts',amount=100,milestone='production',reference='x').status_code==404
    assert post(c,'orders/one/assignment',designerId='d2').status_code==403
    assert c.post('/api/sunroof/orders',json={}).status_code==405
    assert post(c,'members',userId='designer',department='accounts').status_code==403
    sign_in(c,'factory')
    assert [o['id'] for o in workspace(c)['orders']]==['fac']
    assert 'receipts' not in workspace(c)['orders'][0]
    sign_in(c,'s')
    assert c.get('/api/sunroof/workspace').status_code==403
    sign_in(c,'r')
    assert workspace(c)['writable'] is False
    assert post(c,'orders/one/receipts',amount=100,milestone='production',reference='x').status_code==403


def test_measurement_booking_conflict_submission_and_designer_review(api):
    c=prepare(api);sign_in(c,'designer');times=slot()
    result=post(c,'orders/one/visits',workerId='w1',**times)
    assert result.status_code==200,result.text
    visit=next(o for o in result.json()['orders'] if o['id']=='one')['visits'][0]
    assert visit['status']=='confirmed'
    sign_in(c,'other')
    assert post(c,'orders/two/visits',workerId='w1',**times).status_code==409
    sign_in(c,'worker')
    assert [o['id'] for o in workspace(c)['orders']]==['one']
    assert post(c,'orders/one/visits/'+visit['id'],action='reject',reason='x').status_code==422
    assert post(c,'orders/one/visits/'+visit['id'],action='submit',checklist=['Checked'],documents=[]).status_code==422
    for kind,content,mime in [('drawing',b'%PDF-1.4\nTest','application/pdf'),('photo',b'\x89PNG\r\n\x1a\nTest','image/png')]:
        response=c.put('/api/sunroof/orders/one/documents',params={'revision':workspace(c)['revision'],'kind':kind,'visitId':visit['id']},content=content,headers={'Content-Type':mime})
        assert response.status_code==200,response.text
    docs=workspace(c)['orders'][0]['documents']; ids=[d['id'] for d in docs]
    assert post(c,'orders/one/visits/'+visit['id'],action='submit',checklist=['Dimensions and site conditions checked'],documents=ids).status_code==200
    sign_in(c,'designer');assert post(c,'orders/one/visits/'+visit['id']+'/review',approve=False,reason='').status_code==422
    assert post(c,'orders/one/visits/'+visit['id']+'/review',approve=True,reason='').status_code==200
    assert next(o for o in workspace(c)['orders'] if o['id']=='one')['stage']=='drawings'
    sign_in(c,'other');assert c.get('/api/sunroof/orders/one/documents/'+ids[0]).status_code==404


def test_im_reject_returns_visit_to_designer(api):
    c=prepare(api);sign_in(c,'designer')
    result=post(c,'orders/one/visits',workerId='w2',**slot()).json();v=next(o for o in result['orders'] if o['id']=='one')['visits'][0]
    assert v['status']=='pending'
    sign_in(c,'im');assert post(c,'orders/one/visits/'+v['id'],action='reject',reason='').status_code==422
    assert post(c,'orders/one/visits/'+v['id'],action='reject',reason='Unavailable; designer please rebook').status_code==200
    sign_in(c,'designer');assert post(c,'orders/one/visits',workerId='w1',**slot()).status_code==200


def test_payment_roundtrip_accounts_only_and_conflict_rollback(api):
    c=prepare(api);sign_in(c,'designer')
    result=post(c,'orders/one/receipts',amount=40000,milestone='production',reference='BANK-01',date='2026-11-13',destination='bank',mode='UPI').json()
    o=next(o for o in result['orders'] if o['id']=='one');rid=o['receipts'][0]['id'];assert o['balances']['production']==100000
    assert o['receipts'][0]['date']=='2026-11-13'
    assert o['receipts'][0]['destination']=='bank'
    assert o['receipts'][0]['mode']=='UPI'
    assert post(c,f'orders/one/receipts/{rid}/review',approve=True).status_code==403
    sign_in(c,'accounts');assert post(c,f'orders/one/receipts/{rid}/review',approve=False).status_code==422
    rev=workspace(c)['revision'];assert post(c,f'orders/one/receipts/{rid}/review',approve=True,notes='Matched against statement').status_code==200
    assert c.post('/api/sunroof/orders/one/receipts/'+rid+'/review',json={'revision':rev,'approve':True}).status_code==409
    sign_in(c,'designer');o=next(o for o in workspace(c)['orders'] if o['id']=='one');assert o['balances']['production']==60000
    assert 'confirmed by Accounts' in o['history'][-1]['text']
    assert o['receipts'][0]['notes']=='Matched against statement'
    assert post(c,'orders/one/receipts',amount=100,milestone='production',reference='BAD-DATE',date='not-a-date').status_code==422
    assert post(c,'orders/one/receipts',amount=100,milestone='production',reference='BAD-DEST',destination='elsewhere').status_code==422
    sign_in(c);legacy=c.get('/api/store').json();legacy['sunroof']['orders']=[]
    assert c.put('/api/store',json=legacy).status_code==422


def test_factory_accept_start_qc_and_shared_issue(api):
    c=prepare(api);sign_in(c,'factory')
    assert post(c,'orders/fac/factory',action='start').status_code==422
    for action in ['accept','start','complete']:
        r=post(c,'orders/fac/factory',action=action);assert r.status_code==200,r.text
    assert post(c,'orders/fac/factory',action='packed').status_code==422
    assert post(c,'orders/fac/factory',action='qc_fail',remedy='repair').status_code==422
    assert post(c,'orders/fac/factory',action='qc_fail',remedy='repair',reason='Surface finish').status_code==200
    assert post(c,'orders/fac/factory',action='packed').status_code==422
    assert post(c,'orders/fac/factory',action='issue',reason='Designer to check finish specification').status_code==200
    sign_in(c,'designer');o=next(o for o in workspace(c)['orders'] if o['id']=='fac');assert o['issues'][0]['text']=='Designer to check finish specification'


def test_cash_flow_totals_for_factory_without_receipt_details(api):
    c=prepare(api);sign_in(c,'designer')
    r=post(c,'orders/fac/receipts',amount=20000,milestone='production',reference='PRIVATE-REF',date='2026-11-13',destination='bank',mode='UPI')
    assert r.status_code==200
    o=next(o for o in r.json()['orders'] if o['id']=='fac');rid=o['receipts'][0]['id']
    assert o['cashFlow']['received']==0 and o['cashFlow']['pending']==20000
    sign_in(c,'accounts');assert post(c,f'orders/fac/receipts/{rid}/review',approve=True).status_code==200
    sign_in(c,'factory');result=workspace(c);assert len(result['orders'])==1
    o=result['orders'][0]
    assert 'receipts' not in o and 'dues' not in o
    assert 'PRIVATE-REF' not in str(o)
    assert o['cashFlow']['received']==20000
    assert o['cashFlow']['bank']==20000
    assert o['cashFlow']['pending']==0
    assert o['cashFlow']['production']['balance']==80000
    assert o['cashFlow']['dispatch']['balance']==50000
    assert post(c,f'orders/fac/receipts/{rid}/review',approve=False,reason='No').status_code==403
