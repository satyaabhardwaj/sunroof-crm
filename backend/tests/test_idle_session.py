from sqlalchemy import select
from backend.models import sessions
from backend.tests.test_api import api, sign_in


def test_idle_expiry_is_not_extended_by_background_reads(api, monkeypatch):
    c,engine,_=api
    clock=[1800000000]
    monkeypatch.setattr('backend.auth.time.time',lambda:clock[0])
    sign_in(c)
    with engine.connect() as db: initial=db.scalar(select(sessions.c.expires))
    assert initial==clock[0]+1200
    clock[0]+=1199
    assert c.get('/api/auth/me').status_code==200
    assert c.get('/api/store').status_code==200
    with engine.connect() as db: assert db.scalar(select(sessions.c.expires))==initial
    clock[0]+=1
    assert c.get('/api/auth/me').status_code==401
    assert c.post('/api/auth/activity').status_code==401


def test_only_user_activity_renews_valid_session(api, monkeypatch):
    c,engine,_=api;clock=[1800000000]
    monkeypatch.setattr('backend.auth.time.time',lambda:clock[0]);sign_in(c)
    clock[0]+=600
    r=c.post('/api/auth/activity')
    assert r.status_code==200 and r.json()['expiresAt']==(clock[0]+1200)*1000
    assert 'Max-Age=1200' in r.headers['set-cookie']
    clock[0]+=1199
    assert c.get('/api/auth/me').status_code==200
    clock[0]+=2
    assert c.get('/api/store').status_code==401
