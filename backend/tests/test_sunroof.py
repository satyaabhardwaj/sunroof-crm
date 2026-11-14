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
    assert o['cashFlow']['dispatch']['balance']==130000  # cumulative: production + dispatch dues minus all confirmed
    assert post(c,f'orders/fac/receipts/{rid}/review',approve=False,reason='No').status_code==403


def drawings_order(api, **extra):
    client, engine, _ = api
    c = prepare(api)
    edit(engine, 'one', stage='drawings', shippingAddress='12 Park Road', city='Gurugram', state='Haryana', phone='9000000000', email='client@example.com', **extra)
    return c


def edit(engine, order_id, **fields):
    with engine.begin() as db:
        payload = db.scalar(select(state.c.payload))
        o = next(o for o in payload['sunroof']['orders'] if o['id'] == order_id)
        o.update(fields)
        db.execute(update(state).values(payload=payload))


def upload_drawings(c, order='one'):
    ids = []
    for kind, content, mime in [('cad', b'AC1032 test', 'application/acad'), ('client_pdf', b'%PDF-1.4\nClient', 'application/pdf')]:
        r = c.put(f'/api/sunroof/orders/{order}/documents', params={'revision': workspace(c)['revision'], 'kind': kind}, content=content, headers={'Content-Type': mime})
        assert r.status_code == 200, r.text
        ids.append(next(o for o in r.json()['orders'] if o['id'] == order)['documents'][-1]['id'])
    return ids


def one(c, order='one'): return next(o for o in workspace(c)['orders'] if o['id'] == order)
def key(c, order='one'): return one(c, order)['stageInfo']['key']


def test_drawing_versions_client_decision_and_v4_design_head(api):
    c = drawings_order(api); sign_in(c, 'designer')
    assert key(c) == 'measurement_done'
    assert post(c, 'orders/one/design-start').status_code == 200
    assert key(c) == 'design_in_progress'
    sign_in(c, 'worker')
    assert c.put('/api/sunroof/orders/one/documents', params={'revision': workspace(c)['revision'], 'kind': 'cad'}, content=b'AC1032', headers={'Content-Type': 'application/acad'}).status_code in (403, 404)
    sign_in(c, 'designer')
    for v in (1, 2, 3):
        cad, pdf = upload_drawings(c)
        assert post(c, 'orders/one/drawings', cad=cad, pdf=pdf).status_code == 200
        assert key(c) == 'approval_pending' and 'client' in one(c)['journey']
        assert post(c, 'orders/one/drawings', cad=cad, pdf=pdf).status_code == 422  # one open version at a time
        assert post(c, f'orders/one/drawings/{v}/client', approve=False, reason='').status_code == 422
        assert post(c, f'orders/one/drawings/{v}/client', approve=False, reason='Change colour').status_code == 200
    assert post(c, 'orders/one/drawings', cad=cad, pdf=pdf).status_code == 422  # files from an old version cannot be reused
    cad, pdf = upload_drawings(c)
    assert post(c, 'orders/one/drawings', cad=cad, pdf=pdf).status_code == 200
    assert 'Design Head' in one(c)['journey']
    assert post(c, 'orders/one/drawings/4/client', approve=True).status_code == 422
    assert post(c, 'orders/one/drawings/4/head', approve=True).status_code == 403
    sign_in(c, 'head'); assert any('V4 needs your approval' in n['text'] for n in workspace(c)['notifications'])
    assert post(c, 'orders/one/drawings/4/head', approve=True).status_code == 200
    sign_in(c, 'designer'); assert post(c, 'orders/one/drawings/4/client', approve=True).status_code == 200
    o = one(c); assert o['clientApproved'] and key(c) == 'production_payment_pending'


def test_client_link_email_whatsapp_and_public_decision(api):
    c = drawings_order(api, designStartedAt='2026-11-14T00:00:00+00:00'); sign_in(c, 'designer')
    cad, pdf = upload_drawings(c)
    post(c, 'orders/one/drawings', cad=cad, pdf=pdf)
    r = post(c, 'orders/one/drawings/1/send', email='new@example.com'); assert r.status_code == 200, r.text
    share = one(c)['drawings'][0]['share']
    assert share['link'].startswith('http') and '/client/' in share['link']
    assert share['whatsapp'].startswith('whatsapp://send?text=') and 'wa.me' in share['whatsappWeb']
    assert share['mail'].startswith(('sent', 'not sent'))  # no mailbox in tests; the link still works
    assert one(c)['email'] == 'new@example.com'
    token = share['link'].rsplit('/', 1)[1]
    sign_in(c, 'factory'); assert 'one' not in {o['id'] for o in workspace(c)['orders']}
    c.cookies.clear()
    page = c.get(f'/client/{token}'); assert page.status_code == 200 and 'Approve design' in page.text
    assert c.get(f'/client/{token}/file').status_code == 200
    origin = {}  # the test client already sends its own origin
    assert c.post(f'/client/{token}/decision', json={'approve': False}, headers=origin).status_code == 422
    assert c.post(f'/client/{token}/decision', json={'approve': True}, headers=origin).status_code == 200
    assert c.post(f'/client/{token}/decision', json={'approve': True}, headers=origin).status_code == 422
    assert c.get('/client/not-a-real-token').status_code == 404
    sign_in(c, 'designer'); o = one(c)
    assert o['clientApproved'] and any('approved V1 by link' in n['text'] for n in workspace(c)['notifications'])


def test_send_to_factory_gates_and_factory_can_move_required_date(api):
    c = drawings_order(api, clientApproved=True, designStartedAt='2026-11-14T00:00:00+00:00'); sign_in(c, 'designer')
    assert post(c, 'orders/one/handover').json()['error'].startswith('Production payment')
    post(c, 'orders/one/receipts', amount=100000, milestone='production', reference='FULL'); rid = one(c)['receipts'][0]['id']
    assert key(c) == 'production_payment_verification'
    sign_in(c, 'accounts'); assert any('Payment to verify' in n['text'] for n in workspace(c)['notifications'])
    assert post(c, f'orders/one/receipts/{rid}/review', approve=True).status_code == 200
    sign_in(c, 'designer'); assert key(c) == 'approved'
    assert 'needs the product' in post(c, 'orders/one/handover').json()['error']
    assert post(c, 'orders/one/dates', requiredDispatch='2026-12-20', inauguration='2027-01-10', rafterDispatch='2026-12-22').status_code == 200
    assert post(c, 'orders/one/dates', requiredDispatch='2026-12-20', inauguration='2027-01-10', rafterDispatch='2026-12-22').status_code == 422
    assert 'PDI is required' in post(c, 'orders/one/handover', pdiRequired=True).json()['error']
    r = post(c, 'orders/one/handover'); assert r.status_code == 200, r.text  # PDI defaults to not required
    assert key(c) == 'handover_to_factory' and 'factory email' in one(c)['history'][-1]['text']
    sign_in(c, 'factory'); assert any('New handover' in n['text'] for n in workspace(c)['notifications'])
    assert post(c, 'orders/one/dates', requiredDispatch='2026-12-28', inauguration='2030-01-01').status_code == 200
    o = one(c); assert o['dates']['requiredDispatch'] == '2026-12-28' and o['dates']['inauguration'] == '2027-01-10'


def test_handover_needs_shipping_address_and_gaps_are_listed(api):
    c = drawings_order(api, clientApproved=True, dues={'production': 0, 'dispatch': 0}, dates={'requiredDispatch': '2026-12-20'})
    edit(api[1], 'one', shippingAddress='', city='Mumbai', state='Dubai')
    sign_in(c, 'designer')
    gaps = one(c)['gaps']
    assert 'Shipping address' in gaps and any('Dubai' in g for g in gaps)
    assert 'Shipping address' in post(c, 'orders/one/handover').json()['error']
    assert post(c, 'orders/one/contact', shippingAddress='4 Marine Drive', state='Maharashtra').status_code == 200
    assert one(c)['gaps'] == [] and post(c, 'orders/one/handover').status_code == 200


def test_measurement_sees_no_money_and_reschedules_need_contact_and_are_counted(api):
    c = prepare(api); sign_in(c, 'designer')
    day = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
    r = post(c, 'orders/one/visits', workerId='w2', date=day, slot=0); assert r.status_code == 200, r.text
    v = one(c)['visits'][0]; assert v['start'].endswith('09:00:00+05:30') and key(c) == 'measurement_in_progress'
    sign_in(c, 'im')
    o = workspace(c)['orders'][0]
    assert 'cashFlow' not in o and 'balances' not in o and 'dues' not in o
    assert any('Measurement assigned' in n['text'] for n in workspace(c)['notifications'])
    assert post(c, f'orders/one/visits/{v["id"]}', action='reschedule', reason='Client away', date=day, slot=1).status_code == 422
    for n in (1, 2, 3):
        d = (datetime.now(timezone.utc) + timedelta(days=3 + n)).date().isoformat()
        r = post(c, f'orders/one/visits/{v["id"]}', action='reschedule', reason='Client asked', contact='Client, by phone', date=d, slot=2)
        assert r.status_code == 200, r.text
        assert r.json()['orders'][0]['visits'][0]['flagged'] is (n >= 3)
    sign_in(c, 'designer'); h = one(c)
    assert h['visits'][0]['reschedules'] == 3 and len(h['visits'][0]['log']) == 3
    assert any('Flag: visit rescheduled 3 times' in x['text'] for x in h['history'])


def test_executive_can_reschedule_and_visit_progress_is_visible(api):
    c = prepare(api); sign_in(c, 'designer')
    v = post(c, 'orders/one/visits', workerId='w1', **slot()).json()['orders'][0]['visits'][0]
    sign_in(c, 'worker')
    d = (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat()
    assert post(c, f'orders/one/visits/{v["id"]}', action='reschedule', reason='Traffic', contact='Client', date=d, slot=0).status_code == 200
    sign_in(c, 'designer'); assert 'measurement_in_progress' == key(c)


def test_depart_arrive_and_lateness(api):
    c = prepare(api); client, engine, _ = api
    past = datetime.now(timezone.utc) - timedelta(minutes=20)
    edit(engine, 'one', visits=[{'id': 'v1', 'kind': 'measurement', 'workerId': 'w1', 'start': past.isoformat(), 'end': (past + timedelta(hours=2)).isoformat(), 'status': 'confirmed', 'checklist': [], 'documents': []}])
    sign_in(c, 'worker')
    assert post(c, 'orders/one/visits/v1', action='arrive', latitude=28.6, longitude=77.2).status_code == 200
    sign_in(c, 'designer'); o = one(c)
    assert o['visits'][0]['status'] == 'arrived' and o['visits'][0]['lateMinutes'] >= 19
    assert 'reached site' in o['journey'] and 'min late' in o['history'][-1]['text']


def test_calendar_regions_and_auto_measurement_booking(api):
    c = prepare(api); client, engine, _ = api
    edit(engine, 'one', city='Gurugram'); edit(engine, 'two', city='Pune')
    sign_in(c, 'head')
    assert post(c, 'staff/w1', region='Delhi NCR').status_code == 200
    assert post(c, 'staff/w2', region='Mumbai').status_code == 422  # only in-house executives cover a region
    sign_in(c, 'designer')
    cal = c.get('/api/sunroof/calendar', params={'orderId': 'one', 'days': 3}).json()
    assert cal['slots'] == [['09:00', '12:00'], ['13:00', '16:00'], ['17:00', '19:00']]
    assert len(cal['people']) == 2 and all(len(p['days']) == 3 and len(p['days'][0]['slots']) == 3 for p in cal['people'])
    assert cal['suggestion']['workerId'] == 'w1' and cal['people'][0]['suggested']  # Delhi NCR -> in-house executive
    r = post(c, 'orders/one/visits/auto'); assert r.status_code == 200, r.text
    v = one(c)['visits'][0]; assert v['workerId'] == 'w1' and v['status'] == 'confirmed'
    cal = c.get('/api/sunroof/calendar', params={'orderId': 'one', 'days': 14}).json()
    assert len([s for p in cal['people'] if p['workerId'] == 'w1' for d in p['days'] for s in d['slots'] if s == 'busy']) == 1
    sign_in(c, 'other')
    assert c.get('/api/sunroof/calendar', params={'orderId': 'two'}).json()['suggestion']['workerId'] == 'w2'  # other cities -> IMs
    sign_in(c, 'accounts'); assert c.get('/api/sunroof/calendar').status_code == 403


def test_skill_matrix_presence_and_auto_assignment(api):
    c = prepare(api); client, engine, _ = api
    edit(engine, 'one', designerId='', stage='assignment', celebrity=True)
    sign_in(c, 'head')
    assert post(c, 'staff/d1', skills={'celebrity': 3}).status_code == 200
    assert post(c, 'staff/d2', skills={'celebrity': 5, 'normalClient': 4}).status_code == 200
    assert post(c, 'staff/d2', skills={'celebrity': 9}).status_code == 422
    assert post(c, 'staff/w1', skills={'celebrity': 3}).status_code == 422
    ranking = c.get('/api/sunroof/orders/one/designer-ranking').json()['ranking']
    assert ranking[0]['designerId'] == 'd2' and ranking[0]['eligible'] and not ranking[1]['eligible']
    assert post(c, 'orders/one/auto-assign').status_code == 200
    o = one(c); assert o['designerId'] == 'd2' and key(c) == 'measurement_to_assign' and 'auto-assigned' in o['history'][-1]['text']
    sign_in(c, 'other'); assert any('auto-assigned' in n['text'] for n in workspace(c)['notifications'])
    # Punch-in: when someone is punched in, only punched-in designers are considered.
    edit(engine, 'two', designerId='', stage='assignment')
    sign_in(c, 'head'); assert post(c, 'staff/d1', skills={'normalClient': 4}).status_code == 200
    sign_in(c, 'designer'); assert post(c, 'presence', available=True).status_code == 200
    assert post(c, 'presence', available=True, staffId='d2').status_code == 403
    sign_in(c, 'head'); assert post(c, 'auto-assign').status_code == 200
    assert one(c, 'two')['designerId'] == 'd1'
    assert next(d for d in workspace(c)['designers'] if d['id'] == 'd1')['available'] is True


def test_revenue_target_allocation(api):
    from backend import sunroof_rules as R
    c = prepare(api); client, engine, _ = api
    L = R.LAKH; now = datetime.now(timezone.utc).isoformat()
    # The Design Head's example: two qualified designers already past Rs 40 lakh this month, one at Rs 25 lakh.
    with engine.begin() as db:
        payload = db.scalar(select(state.c.payload)); data = payload['sunroof']
        data['designers'] = [{'id': f'd{i}', 'name': n, 'location': '', 'skills': {'celebrity': 5, 'hni': 5, 'normalClient': 5}} for i, n in ((1, 'Designer'), (2, 'Other'), (3, 'Third'))] + \
                            [{'id': 'd4', 'name': 'Trainee', 'location': '', 'skills': {'celebrity': 0, 'hni': 0, 'normalClient': 2}}]
        data['orders'] = [o for o in data['orders'] if o['id'] == 'one'] + [
            {'id': f'past{i}', 'reference': f'P{i}', 'client': 'Past', 'designerId': d, 'value': v * L, 'assignedAt': now, 'stage': 'drawings', 'history': [], 'models': []}
            for i, (d, v) in enumerate((('d1', 45), ('d2', 47), ('d3', 25)))]
        data['orders'][0].update(designerId='', stage='assignment', clientType='celebrity', value=10 * L)
        db.execute(update(state).values(payload=payload))
    sign_in(c, 'head')
    ranking = c.get('/api/sunroof/orders/one/designer-ranking').json()['ranking']
    assert [r['designerId'] for r in ranking[:3]] == ['d3', 'd1', 'd2'] and not ranking[3]['eligible']
    assert post(c, 'orders/one/auto-assign').status_code == 200
    o = one(c); assert o['designerId'] == 'd3' and '₹25.0 lakh of ₹40.0 lakh' in o['history'][-1]['text']
    d3 = next(d for d in workspace(c)['designers'] if d['id'] == 'd3'); assert d3['monthAssigned'] == 35 * L and d3['monthTarget'] == 40 * L
    assert post(c, 'staff/d2', target=60 * L).status_code == 200
    assert post(c, 'staff/w1', target=60 * L).status_code == 422
    assert post(c, 'allocation', monthlyTarget=40 * L, minimumSkill=4).status_code == 200


def test_nobody_rated_blocks_auto_assignment(api):
    c = prepare(api); client, engine, _ = api
    edit(engine, 'one', designerId='', stage='assignment')
    sign_in(c, 'head')
    assert 'skill matrix' in post(c, 'orders/one/auto-assign').json()['error']


def test_qc_failure_returns_to_production_then_rafters_then_consoles(api):
    c = prepare(api); client, engine, _ = api
    edit(engine, 'fac', dues={'production': 100000, 'rafter': 30000, 'dispatch': 20000})
    sign_in(c, 'factory')
    for a in ['accept', 'start', 'complete']: assert post(c, 'orders/fac/factory', action=a).status_code == 200
    assert post(c, 'orders/fac/factory', action='qc_fail', remedy='replace', reason='Crack').status_code == 200
    assert key(c, 'fac') == 'production_started' and 'replace' in one(c, 'fac')['journey']
    for a in ['complete', 'qc_pass', 'packed']: assert post(c, 'orders/fac/factory', action=a).status_code == 200
    sign_in(c, 'designer')
    assert key(c, 'fac') == 'rafter_payment_pending'
    assert post(c, 'orders/fac/dispatch', part='rafter', action='request').json()['error'].startswith('The dispatch payment')
    post(c, 'orders/fac/receipts', amount=130000, milestone='rafter', reference='RAFTER'); rid = one(c, 'fac')['receipts'][0]['id']
    assert key(c, 'fac') == 'rafter_payment_verification'
    sign_in(c, 'accounts'); assert post(c, f'orders/fac/receipts/{rid}/review', approve=True).status_code == 200
    sign_in(c, 'designer'); assert key(c, 'fac') == 'dispatch_pending'  # verified payment requests dispatch automatically
    assert post(c, 'orders/fac/dispatch', part='rafter', action='ready').status_code == 403
    sign_in(c, 'factory')
    assert post(c, 'orders/fac/dispatch', part='console', action='ready').status_code == 422
    assert post(c, 'orders/fac/dispatch', part='rafter', action='dispatched').status_code == 422
    assert post(c, 'orders/fac/dispatch', part='rafter', action='ready').status_code == 200
    sign_in(c, 'designer'); assert key(c, 'fac') == 'ready_to_dispatch'
    sign_in(c, 'factory'); assert post(c, 'orders/fac/dispatch', part='rafter', action='dispatched').status_code == 200
    sign_in(c, 'designer'); o = one(c, 'fac'); assert o['journey'].startswith('Console dispatch payment')
    post(c, 'orders/fac/receipts', amount=20000, milestone='dispatch', reference='CONSOLE'); rid = [r for r in one(c, 'fac')['receipts'] if r['reference'] == 'CONSOLE'][0]['id']
    sign_in(c, 'accounts'); post(c, f'orders/fac/receipts/{rid}/review', approve=True)
    sign_in(c, 'factory')
    for a in ['ready', 'dispatched']: assert post(c, 'orders/fac/dispatch', part='console', action=a).status_code == 200
    sign_in(c, 'designer'); o = one(c, 'fac')
    assert o['stage'] == 'dispatched' and key(c, 'fac') == 'dispatched'
    assert any('Consoles dispatched' in n['text'] for n in workspace(c)['notifications'])


def test_designer_adds_area_with_its_own_workflow(api):
    c = prepare(api); sign_in(c, 'designer')
    r = post(c, 'orders/one/areas', name='Pantry', models=[{'code': 'P1', 'quantity': 1}]); assert r.status_code == 200, r.text
    area = next(o for o in workspace(c)['orders'] if o.get('parentId') == 'one')
    assert area['reference'] == 'one/2' and area['designerId'] == 'd1' and area['shipWithParent'] and area['stage'] == 'measurement'
    assert 'cashFlow' in area and area['partCodes'] == {'rafter': 'one/2-R', 'console': 'one/2-C'}
    assert post(c, f"orders/{area['id']}/areas", name='Deck').status_code == 200
    assert {o['reference'] for o in workspace(c)['orders'] if o.get('parentId') == 'one'} == {'one/2', 'one/3'}
    sign_in(c, 'other'); assert post(c, 'orders/one/areas', name='X').status_code == 404


def test_rules_plan_targets_and_search():
    from backend import sunroof_rules as R
    o = {'value': 1000000, 'plan': 'SM', 'receivedBeforeDesign': 150000, 'receipts': []}
    assert R.targets(o) == {'production': 800000, 'rafter': 1000000, 'dispatch': 1000000}
    assert R.balance(o, 'production') == 650000  # booking arrears stay inside the production gate
    f = {'value': 1000000, 'plan': 'Founder'}
    assert R.targets(f) == {'production': 800000, 'rafter': 950000, 'dispatch': 1000000}
    assert R.targets({'plan': 'SM'})['production'] is None
    from backend.sunroof import search_text
    assert 'architect anand' in search_text({'reference': 'R1', 'client': 'X', 'architect': 'Architect Anand', 'aliases': ['Shivang']})


def test_zoho_staff_merge_keeps_crm_fields():
    from backend.sunroof_zoho import merge
    data = {'designers': [{'id': 'zoho-1', 'name': 'Old', 'location': 'Delhi', 'skills': {'celebrity': 5}}], 'workers': []}
    added = merge(data, [{'zohoId': '1', 'name': 'New name', 'kind': 'designer', 'location': ''},
                         {'zohoId': '2', 'name': 'IM', 'kind': 'installation_manager', 'location': 'Pune'}])
    assert added == 1 and data['designers'][0] == {'id': 'zoho-1', 'name': 'New name', 'location': 'Delhi', 'skills': {'celebrity': 5}}
    assert data['workers'][0]['kind'] == 'installation_manager' and data['workers'][0]['id'] == 'zoho-2'


SHEET = """Sunrooof Designer Skill Matrix,,,,,,,,,,,,,,,,
Design head: enter 0-5,,,,,,,,,,,,,,,,
Team average per skill /5,,3.29,3.29,3.71,3.71,3.71,3.57,2.86,3.14,,,,,,,
Sr. No.,Designer Name,Geography /5,Workload Handling /5,Residential /5,Commercial /5,Property Size /5,Normal Client /5,Celebrity Client /5,HNI Client /5,Total /40,Average /5,Skills Rated /8,Rated By,Review Date,Review Notes,Zoho User ID
1,Designer,3,4,5,5,5,5,3,4,34,4.25,8,,,Not for celebrity clients,111
2,Other,5,5,5,5,5,5,5,5,40,5.00,8,,,Handles celebrity clients,222
3,Nobody,1,,,,,,,,,,,,,,999
"""


def test_skill_matrix_sheet_import_drives_allocation(api):
    c = prepare(api); client, engine, _ = api
    edit(engine, 'one', designerId='', stage='assignment', clientType='celebrity')
    sign_in(c, 'designer')
    r = c.post('/api/sunroof/skill-matrix', params={'revision': workspace(c)['revision']}, content=SHEET.encode())
    assert r.status_code == 403
    sign_in(c, 'head')
    r = c.post('/api/sunroof/skill-matrix', params={'revision': workspace(c)['revision']}, content=SHEET.encode()); assert r.status_code == 200, r.text
    d = {x['id']: x for x in workspace(c)['designers']}
    assert d['d1']['skills']['hni'] == 4 and d['d2']['skillNotes'] == 'Handles celebrity clients'
    ranking = c.get('/api/sunroof/orders/one/designer-ranking').json()['ranking']
    assert [x['designerId'] for x in ranking] == ['d2', 'd1'] and ranking[0]['traits'] == ['celebrity']
    assert ranking[0]['eligible'] and not ranking[1]['eligible']  # a 3 for celebrity does not qualify
    assert c.post('/api/sunroof/skill-matrix', params={'revision': workspace(c)['revision']}, content=b'a,b\n1,2').status_code == 422


def test_skill_sheet_parser_and_traits():
    from backend import sunroof_rules as R
    rows = R.parse_skill_sheet(SHEET)
    assert rows[0] == {'zohoId': '111', 'name': 'Designer', 'notes': 'Not for celebrity clients', 'skills': {'geography': 3, 'workload': 4, 'residential': 5, 'commercial': 5, 'propertySize': 5, 'normalClient': 5, 'celebrity': 3, 'hni': 4}}
    assert rows[2]['skills'] == {'geography': 1}  # blank = unrated
    assert R.traits({'clientType': 'hni', 'country': 'UAE', 'projectType': 'commercial', 'complex': True}, R.DEFAULT_ALLOCATION) == ['hni', 'geography', 'commercial', 'propertySize']
    assert R.traits({}, R.DEFAULT_ALLOCATION) == ['normalClient']


def test_task_list_shows_to_me_by_me_due_and_reports(api):
    c = prepare(api); sign_in(c, 'designer')
    day = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
    assert post(c, 'orders/one/visits', workerId='w1', date=day, slot=1).status_code == 200
    mine = workspace(c)['tasks']
    by_me = next(t for t in mine['byMe'] if t['orderId'] == 'one')
    assert by_me['title'] == 'Do the measurement visit' and by_me['to'] == 'Executive' and by_me['by'] == 'Designer' and by_me['due'] == day
    assert not any(t['orderId'] == 'one' for t in mine['toMe'])
    sign_in(c, 'worker')
    t = next(t for t in workspace(c)['tasks']['toMe'] if t['orderId'] == 'one')
    assert t['by'] == 'Designer' and t['due'] == day and not t['overdue']
    assert post(c, 'tasks/one/report', status='not_done').status_code == 422
    assert post(c, 'tasks/one/report', status='done', note='Measured, uploading drawings').status_code == 200
    sign_in(c, 'other'); assert post(c, 'tasks/one/report', status='done').status_code == 404
    sign_in(c, 'accounts'); assert post(c, 'tasks/one/report', status='done').status_code == 403
    sign_in(c, 'designer')
    assert any('Executive: Do the measurement visit — done' in n['text'] for n in workspace(c)['notifications'])
    assert next(t for t in workspace(c)['tasks']['byMe'] if t['orderId'] == 'one')['report']['status'] == 'done'
    # When the work actually moves on, the task closes and the next one opens for its owner.
    sign_in(c, 'head'); assert post(c, 'orders/one/assignment', designerId='d1').status_code == 200
    edit(api[1], 'one', stage='drawings', visits=[])
    sign_in(c, 'designer'); assert post(c, 'orders/one/design-start').status_code == 200
    mine = workspace(c)['tasks']
    assert next(t for t in mine['toMe'] if t['orderId'] == 'one')['title'] == 'Make and submit the next drawing version'
    closed = next(t for t in mine['done'] if t['title'] == 'Do the measurement visit')
    assert closed['closedAt'] and closed['closedBy'] == 'Designer' and closed['report']['status'] == 'done'


def test_bell_counts_hides_clears_and_skips_repeats(api):
    c = prepare(api); sign_in(c, 'designer')
    for ref, amount in (('A', 100), ('B', 200)):
        post(c, 'orders/one/receipts', amount=amount, milestone='production', reference=ref)
    sign_in(c, 'accounts')
    bell = workspace(c)['notifications']
    assert len(bell) == 2 and all(n['unread'] and n['column'] == 'payments' for n in bell)
    assert post(c, 'notifications/seen').status_code == 200
    assert not any(n['unread'] for n in workspace(c)['notifications'])
    assert post(c, 'notifications/hide', ids=[bell[0]['id']]).status_code == 200
    assert len(workspace(c)['notifications']) == 1
    assert post(c, 'notifications/hide', column='payments').status_code == 200
    assert workspace(c)['notifications'] == []
    assert post(c, 'notifications/hide', column='payments').status_code == 422
    sign_in(c, 'designer')  # hiding is per person
    sign_in(c, 'head'); assert post(c, 'orders/one/assignment', designerId='d1').status_code == 200
    assert post(c, 'orders/one/assignment', designerId='d1').status_code == 200
    sign_in(c, 'designer')
    texts = [n['text'] for n in workspace(c)['notifications'] if n['orderId'] == 'one']
    assert texts.count('Designer assigned: Designer') == 1  # the same line twice for one client shows once
