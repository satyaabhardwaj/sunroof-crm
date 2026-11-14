"""Sunrooof departmental workspaces backed by one order record and a revision lock.

Workflow rules live in sunroof_rules.py; this file holds the endpoints, permissions and side effects
(email to clients and the factory, notifications, files).
"""
import hashlib
import html
import os
import secrets
import urllib.parse
from copy import deepcopy
from datetime import datetime, timezone, timedelta, date as Date
from uuid import uuid4
from typing import Literal
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime
from sqlalchemy import select, update
from .models import state, users
from .repository import event
from . import sunroof_rules as R
from .sunroof_rules import FACTORY_STAGES

DEPARTMENTS = ('design', 'design-head', 'measurement', 'accounts', 'factory')
DESIGN = ['design', 'design-head']
RESCHEDULE_FLAG = 3  # two reschedules are normal; the third is flagged, never blocked (meeting A 13:02-13:10, 25:38-25:43)
LINK_DAYS = 30

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    revision: int = Field(ge=0, strict=True)
class Assignment(Input):
    designerId: str = Field(min_length=1, max_length=80)
class NewDesigner(Input):
    name: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1, max_length=160)
    payGrade: str = Field(default='', max_length=80)
class Worker(Input):
    name: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1, max_length=160)
    kind: Literal['executive', 'installation_manager']
    region: Literal['Delhi NCR', 'Mumbai', ''] = ''
class StaffUpdate(Input):
    location: str | None = Field(default=None, max_length=160)
    capacity: int | None = Field(default=None, ge=1, le=200)
    target: int | None = Field(default=None, gt=0, le=100000000000)  # this designer's monthly revenue target, paise
    region: Literal['Delhi NCR', 'Mumbai', ''] | None = None  # in-house measurement executives only
    skills: dict[Literal['geography', 'workload', 'residential', 'commercial', 'propertySize', 'normalClient', 'celebrity', 'hni'], int] | None = None
class Presence(Input):
    available: bool
    staffId: str = Field(default='', max_length=100)
class Allocation(Input):
    monthlyTarget: int = Field(gt=0, le=100000000000)  # paise; default ₹40 lakh
    minimumSkill: int = Field(ge=0, le=5)
    largeSquareFeet: int | None = Field(default=None, ge=1, le=1000000)
class Membership(Input):
    userId: str = Field(min_length=1, max_length=100)
    department: Literal['design', 'design-head', 'measurement', 'accounts', 'factory']
    staffId: str = Field(default='', max_length=100)
class Booking(Input):
    workerId: str = Field(min_length=1, max_length=80)
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None
    date: Date | None = None
    slot: int | None = Field(default=None, ge=0, le=2)
    slots: int = Field(default=1, ge=1, le=3)
    kind: Literal['measurement', 'pdi'] = 'measurement'
class AutoBooking(Input):
    kind: Literal['measurement', 'pdi'] = 'measurement'
class VisitAction(Input):
    action: Literal['accept', 'reject', 'reschedule', 'depart', 'arrive', 'submit']
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None
    date: Date | None = None
    slot: int | None = Field(default=None, ge=0, le=2)
    slots: int = Field(default=1, ge=1, le=3)
    reason: str = Field(default='', max_length=2000)
    contact: str = Field(default='', max_length=200)  # who was spoken to before a reschedule
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    checklist: list[str] = Field(default_factory=list, max_length=100)
    documents: list[str] = Field(default_factory=list, max_length=100)
class Review(Input):
    approve: bool
    reason: str = Field(default='', max_length=2000)
class ReceiptReview(Review):
    notes: str = Field(default="", max_length=2000)
class Receipt(Input):
    amount: int = Field(gt=0, le=100000000000, strict=True)  # paise, never binary currency arithmetic
    milestone: Literal['production', 'rafter', 'dispatch']
    reference: str = Field(min_length=1, max_length=160)
    date: Date | None = None
    destination: Literal['bank', 'management'] | None = None
    mode: Literal['Bank transfer', 'UPI', 'Cheque', 'Cash', 'Card', 'Other'] | None = None
class Contact(Input):
    email: str | None = Field(default=None, max_length=200, pattern=r'^$|^[^@\s]+@[^@\s]+\.[^@\s]+$')
    phone: str | None = Field(default=None, max_length=40)
    shippingAddress: str | None = Field(default=None, max_length=1000)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    architect: str | None = Field(default=None, max_length=160)
    poc: str | None = Field(default=None, max_length=160)
    pocPhone: str | None = Field(default=None, max_length=40)
    billingName: str | None = Field(default=None, max_length=160)
class Profile(Input):
    clientType: Literal['normal', 'hni', 'celebrity'] | None = None
    celebrity: bool | None = None
    projectType: Literal['residential', 'commercial'] | None = None
    complex: bool | None = None
    country: str | None = Field(default=None, max_length=120)
    squareFeet: int | None = Field(default=None, ge=0, le=10000000)
class Money(Input):
    value: int | None = Field(default=None, ge=0, le=100000000000)  # total payable, paise
    plan: Literal['SM', 'AVP', 'Founder', 'Custom'] | None = None
    receivedBeforeDesign: int | None = Field(default=None, ge=0, le=100000000000)
class DrawingVersion(Input):
    cad: str = Field(min_length=1, max_length=80)
    pdf: str = Field(min_length=1, max_length=80)
    note: str = Field(default='', max_length=2000)
class SendDrawing(Input):
    email: str = Field(default='', max_length=200, pattern=r'^$|^[^@\s]+@[^@\s]+\.[^@\s]+$')
class ClientDecision(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    approve: bool
    reason: str = Field(default='', max_length=2000)
class KeyDates(Input):
    # Captured by Sales first, then confirmed by the designer (meeting B 5:45-6:28; owner 14 Nov).
    requiredDispatch: Date | None = None
    rafterDispatch: Date | None = None
    consoleDispatch: Date | None = None
    rafterInstallation: Date | None = None
    consoleInstallation: Date | None = None
    inauguration: Date | None = None  # tentative puja / handover date
class Handover(Input):
    pdiRequired: bool = False  # the pop-up defaults to No (owner, 14 Nov)
class FactoryAction(Input):
    action: Literal['accept', 'issue', 'start', 'complete', 'qc_pass', 'qc_fail', 'packed']
    reason: str = Field(default='', max_length=2000)
    remedy: Literal['repair', 'replace', 'reproduce'] | None = None
class DispatchAction(Input):
    part: Literal['rafter', 'console']
    action: Literal['request', 'ready', 'dispatched']
    note: str = Field(default='', max_length=2000)
class Area(Input):
    name: str = Field(min_length=1, max_length=120)
    models: list[dict] = Field(default_factory=list, max_length=100)
    value: int | None = Field(default=None, ge=0, le=100000000000)
    shipWithParent: bool = True
class Seen(Input):
    ids: list[str] = Field(default_factory=list, max_length=500)
    column: Literal['work', 'payments', ''] = ''
class TaskReport(Input):
    status: Literal['done', 'not_done']
    note: str = Field(default='', max_length=2000)

def now(): return datetime.now(timezone.utc).isoformat()
def record(order, user, text):
    order.setdefault('history', []).append({'at': now(), 'by': user['id'], 'text': text})
def remaining(order, milestone): return R.balance(order, milestone)

def cash_summary(order):
    # Safe totals for every department except Measurement; raw references and notes stay with Design/Accounts.
    receipts = order.get('receipts', [])
    confirmed = [r for r in receipts if r['status'] == 'confirmed']
    result = {'received': sum(r['amount'] for r in confirmed),
              'beforeDesign': order.get('receivedBeforeDesign') or 0,
              'pending': sum(r['amount'] for r in receipts if r['status'] == 'requested'),
              'bank': sum(r['amount'] for r in confirmed if r.get('destination') == 'bank'),
              'management': sum(r['amount'] for r in confirmed if r.get('destination') == 'management'),
              'unclassified': sum(r['amount'] for r in confirmed if r.get('destination') not in ('bank', 'management'))}
    goals = R.targets(order)
    for milestone in R.MILESTONES:
        result[milestone] = {'due': goals[milestone],
            'received': sum(r['amount'] for r in confirmed if r['milestone'] == milestone),
            'pending': sum(r['amount'] for r in receipts if r['milestone'] == milestone and r['status'] == 'requested'),
            'balance': R.balance(order, milestone)}
    return result

def search_text(order):
    keys = ('reference', 'client', 'email', 'phone', 'architect', 'poc', 'billingName', 'customerId', 'projectId', 'opportunityId')
    return ' '.join([str(order.get(k) or '') for k in keys] + list(order.get('aliases') or [])).casefold()

def register(app, engine, who, settings=None):
    def read(db):
        row = db.execute(select(state).where(state.c.id == 1)).mappings().first()
        if not row: raise HTTPException(503, 'Configure an isolated Sunroof database first.')
        payload = deepcopy(row['payload'])
        data = payload.setdefault('sunroof', {})
        for key in ('orders', 'designers', 'workers', 'members', 'notifications'): data.setdefault(key, [])
        return row['rev'], payload, data

    def identity(db, request, data):
        user = who(db, request)
        member = next((m for m in data['members'] if m['userId'] == user['id']), None)
        if user['role'] == 'admin': return {**user, 'department': 'admin', 'staffId': ''}
        if not member:
            if user['role'] == 'reader': return {**user, 'department': 'observer', 'staffId': ''}
            raise HTTPException(403, 'Your Sunroof department has not been assigned.')
        return {**user, **member}

    def permitted(user, roles):
        if user['role'] == 'reader' or (user['department'] != 'admin' and user['department'] not in roles):
            raise HTTPException(403, 'This action belongs to another department.')

    def scoped(order, user):
        role = user['department']
        if role in ('admin', 'observer', 'design-head', 'accounts'): return True
        if role == 'design': return order.get('designerId') == user['staffId']
        if role == 'measurement': return any(v['workerId'] == user['staffId'] for v in order.get('visits', []))
        return order.get('stage') in FACTORY_STAGES

    def keys_of(user):
        keys = {'dept:' + user['department']}
        if user['department'] == 'design': keys.add('designer:' + user['staffId'])
        if user['department'] == 'measurement': keys.add('worker:' + user['staffId'])
        return keys

    def column_of(text):
        return 'payments' if any(w in text.casefold() for w in ('payment', 'receipt', 'accounts', '₹')) else 'work'

    def inbox(data, user):
        """Like the Magppie bell: two columns, newest first, a red count of what you have not seen,
        a cross removes one line, Clear all empties a column, and the same line twice for one client shows once."""
        mine = data.setdefault('seen', {}).get(user['id'], {})
        hidden, seen_at = set(mine.get('hidden', [])), mine.get('at', '')
        everyone = user['department'] in ('admin', 'observer')
        keys = keys_of(user)
        out, twice = [], set()
        for n in reversed(data['notifications']):
            if n['id'] in hidden or (not everyone and n['to'] not in keys): continue
            same = (n.get('orderId'), n['text'])
            if same in twice: continue
            twice.add(same)
            out.append({**n, 'column': column_of(n['text']), 'unread': n['at'] > seen_at})
            if len(out) == 60: break
        return out

    def person_name(data, user):
        if user.get('department') == 'client': return 'Client'
        staff = next((p['name'] for p in data['designers'] + data['workers'] if user.get('staffId') and p['id'] == user['staffId']), None)
        return staff or {'admin': 'Admin', 'design-head': 'Design Head', 'accounts': 'Accounts', 'factory': 'Factory'}.get(user.get('department'), user.get('id', ''))

    def describe(data, key):
        kind, _, ident = key.partition(':')
        if kind in ('designer', 'worker'):
            return next((p['name'] for p in data['designers' if kind == 'designer' else 'workers'] if p['id'] == ident), 'Unassigned')
        return {'accounts': 'Accounts', 'factory': 'Factory', 'design-head': 'Design Head'}.get(ident, ident)

    def sync_task(data, user, order):
        """Close the order's current task when the work moves on and open the next one, remembering who gave it."""
        now_task = R.task_of(order)
        current = order.get('task')
        same = current and now_task and all(current.get(k) == now_task[k] for k in ('key', 'title', 'to'))
        if same:
            current['due'] = now_task['due']; return
        if current:
            current.update(closedAt=now(), closedBy=person_name(data, user))
            order.setdefault('taskLog', []).append(current); del order['taskLog'][:-50]
        order['task'] = {**now_task, 'id': str(uuid4()), 'by': person_name(data, user), 'byId': user.get('id', ''),
                         'byKey': next(iter(sorted(k for k in keys_of(user) if not k.startswith('dept:'))), 'dept:' + user.get('department', '')) if user.get('department') not in ('client', 'admin') else '',
                         'since': now()} if now_task else None

    def task_rows(data, user):
        keys, everyone = keys_of(user), user['department'] in ('admin', 'observer')
        today = datetime.now(R.IST).date().isoformat()
        to_me, by_me, done = [], [], []
        for o in data['orders']:
            t = o.get('task') or ({**R.task_of(o), 'id': o['id'] + ':current', 'by': '', 'byId': '', 'since': (o.get('history') or [{}])[-1].get('at', '')} if R.task_of(o) else None)
            row = lambda t: {'id': t['id'], 'orderId': o['id'], 'reference': o.get('reference', ''), 'client': o.get('client', ''), 'title': t['title'],
                             'to': describe(data, t['to']), 'by': t.get('by', ''), 'since': t.get('since', ''), 'due': t.get('due'),
                             'overdue': bool(t.get('due') and t['due'] < today and not t.get('closedAt')), 'report': t.get('report'),
                             'closedAt': t.get('closedAt'), 'closedBy': t.get('closedBy')}
            if t:
                if everyone or t['to'] in keys: to_me.append(row(t))
                if t.get('byId') == user['id']: by_me.append(row(t))
            for old in o.get('taskLog', [])[-10:]:
                if old['to'] in keys or old.get('byId') == user['id']: done.append(row(old))
        due_first = lambda r: (r['due'] or '9999', r['since'])
        return {'toMe': sorted(to_me, key=due_first)[:200], 'byMe': sorted(by_me, key=due_first)[:200],
                'done': sorted(done, key=lambda r: r['closedAt'] or '', reverse=True)[:50]}

    def project(data, revision, user, request):
        requested = request.query_params.get('department', 'design')
        dept = requested if user['department'] in ('admin', 'observer') else user['department']
        if dept not in DEPARTMENTS: dept = 'design'
        orders = [deepcopy(o) for o in data['orders'] if scoped(o, user)]
        if dept == 'measurement': orders = [o for o in orders if o.get('visits')]
        if dept == 'factory': orders = [o for o in orders if o.get('stage') in FACTORY_STAGES]
        for o in orders:
            info = R.journey(o)
            o['stageInfo'] = info
            o['journey'] = info['label'] + (' · ' + info['detail'] if info['detail'] else '')
            o['gaps'] = R.handoff_gaps(o)
            o['search'] = search_text(o)
            o['partCodes'] = {p: f"{o['reference']}-{p[0].upper()}" for p in R.PARTS}
            if not o.get('task') and R.task_of(o):  # orders untouched since tasks began still show what is next
                o['task'] = {**R.task_of(o), 'id': o['id'] + ':current', 'by': '', 'since': (o.get('history') or [{}])[-1].get('at', '')}
            for v in o.get('visits', []): v['flagged'] = v.get('reschedules', 0) >= RESCHEDULE_FLAG
            if dept != 'measurement':  # Measurement gets no money at all (meeting A 19:29-19:52)
                o['cashFlow'] = cash_summary(o)
                o['balances'] = {s: R.balance(o, s) for s in R.MILESTONES}
            if dept in ('measurement', 'factory'):
                o.pop('receipts', None); o.pop('dues', None); o.pop('value', None); o.pop('receivedBeforeDesign', None)
                o['history'] = [h for h in o.get('history', []) if not h['text'].startswith('Payment')]
            if dept not in DESIGN:  # client approval links are for Design only
                for d in o.get('drawings', []): d.pop('share', None)
            if user['department'] == 'measurement':
                o['visits'] = [v for v in o.get('visits', []) if v['workerId'] == user['staffId']]
        availability = [{'workerId': v['workerId'], 'start': v['start'], 'end': v['end']} for o in data['orders'] for v in o.get('visits', []) if v['status'] not in ('rejected', 'approved', 'submitted')]
        target = {**R.DEFAULT_ALLOCATION, **data.get('allocation', {})}['monthlyTarget']
        designers = [{**d, 'available': R.available(d), 'load': R.active_load(data['orders'], d['id']),
                      'monthAssigned': R.month_revenue(data['orders'], d['id']), 'monthTarget': d.get('target') or target} for d in data['designers']]
        workers = [{**w, 'available': R.available(w)} for w in data['workers']]
        return {'orders': orders, 'designers': designers, 'workers': workers, 'availability': availability,
                'revision': revision, 'writable': user['role'] != 'reader', 'department': dept,
                'access': user['department'], 'staffId': user['staffId'], 'demo': data.get('demo', False), 'directory': data.get('directory'),
                'stages': [{'key': k, 'label': l, 'owner': o} for k, l, o in R.STAGES], 'slots': [[a.strftime('%H:%M'), b.strftime('%H:%M')] for a, b in R.SLOTS],
                'allocation': {**R.DEFAULT_ALLOCATION, **data.get('allocation', {})}, 'notifications': inbox(data, user), 'tasks': task_rows(data, user),
                'departments': list(DEPARTMENTS) if user['department'] in ('admin', 'observer') else [user['department']]}

    def notify(data, to, order, text):
        last = next((n for n in reversed(data['notifications']) if n['to'] == to), None)
        if last and last.get('orderId') == (order['id'] if order else '') and last['text'] == text: return  # no repeats
        data['notifications'].append({'id': str(uuid4()), 'to': to, 'orderId': order['id'] if order else '',
                                      'reference': order.get('reference', '') if order else '', 'text': text, 'at': now(), 'read': False})
        del data['notifications'][:-1000]

    def tell_owners(data, user, order, before_owner, history_from):
        """The designer hears about every change someone else makes; the next owner hears when work reaches them."""
        sync_task(data, user, order)
        new = order.get('history', [])[history_from:]
        if not new: return
        text = new[-1]['text']
        if order.get('designerId') and not (user['department'] == 'design' and user['staffId'] == order['designerId']):
            notify(data, 'designer:' + order['designerId'], order, text)
        owner = R.journey(order)['owner']
        if owner != before_owner and owner not in ('design', user['department']):
            notify(data, 'dept:' + owner, order, R.journey(order)['label'] + ': ' + order.get('client', ''))

    def change(request, revision, roles, operation, order_id=None):
        with engine.begin() as db:
            _, _, initial = read(db); user = identity(db, request, initial); permitted(user, roles)
            changed = db.execute(update(state).where(state.c.id == 1, state.c.rev == revision).values(rev=revision + 1))
            if changed.rowcount != 1: raise HTTPException(409, 'Another team updated this order. Refresh and review before retrying; your form is retained.')
            _, payload, data = read(db)
            order = None
            if order_id:
                order = next((o for o in data['orders'] if o['id'] == order_id), None)
                if not order or not scoped(order, user): raise HTTPException(404, 'Order not found in your workspace.')
            before_owner, history_from = (R.journey(order)['owner'], len(order.get('history', []))) if order else (None, 0)
            operation(data, user, order, db)
            if order: tell_owners(data, user, order, before_owner, history_from)
            db.execute(update(state).where(state.c.id == 1).values(payload=payload))
            event(db, user['id'], 'sunroof.department.update', order_id)
            return project(data, revision + 1, user, request)

    @app.get('/api/sunroof/workspace')
    def workspace(request: Request):
        with engine.connect() as db:
            rev, _, data = read(db); user = identity(db, request, data)
            return project(data, rev, user, request)

    # ------------------------------------------------------------ people, presence, allocation

    # No new opportunity or order endpoint: booked orders enter through a reviewed source import.
    @app.post('/api/sunroof/designers')
    def designer(body: NewDesigner, request: Request):
        def op(data, user, order, db):
            if any(d['name'].casefold() == body.name.casefold() for d in data['designers']): raise HTTPException(422, 'Designer already exists.')
            data['designers'].append({**body.model_dump(exclude={'revision'}), 'id': str(uuid4())})
        return change(request, body.revision, ['design-head'], op)

    @app.post('/api/sunroof/workers')
    def worker(body: Worker, request: Request):
        def op(data, user, order, db):
            data['workers'].append({**body.model_dump(exclude={'revision'}), 'id': str(uuid4())})
        return change(request, body.revision, ['design-head'], op)

    @app.post('/api/sunroof/staff/{staff_id}')
    def staff_update(staff_id: str, body: StaffUpdate, request: Request):
        # Skill matrix (0-5 per skill), base location and optional open-order cap, set by the Design Head.
        def op(data, user, order, db):
            person = next((p for p in data['designers'] + data['workers'] if p['id'] == staff_id), None)
            if not person: raise HTTPException(404, 'Staff member not found.')
            if body.skills is not None:
                if person in data['workers']: raise HTTPException(422, 'Skills apply to designers; measurement uses location and calendar.')
                if any(not 0 <= v <= 5 for v in body.skills.values()): raise HTTPException(422, 'Rate each skill from 0 to 5.')
                person['skills'] = body.skills
            if body.location is not None: person['location'] = body.location
            if body.capacity is not None: person['capacity'] = body.capacity
            if body.target is not None:
                if person in data['workers']: raise HTTPException(422, 'Revenue targets apply to designers.')
                person['target'] = body.target
            if body.region is not None:
                if person.get('kind') != 'executive': raise HTTPException(422, 'Only in-house Measurement Executives cover a region.')
                person['region'] = body.region
        return change(request, body.revision, ['design-head'], op)

    @app.post('/api/sunroof/skill-matrix')
    async def skill_matrix(request: Request, revision: int):
        # The Design Head uploads the skill matrix sheet as CSV; designers are matched by Zoho user ID, then by name.
        try: rows = R.parse_skill_sheet((await request.body()).decode('utf-8-sig'))
        except (UnicodeDecodeError, ValueError) as error: raise HTTPException(422, str(error)) from None
        def op(data, user, order, db):
            matched, missing = 0, []
            for row in rows:
                d = next((x for x in data['designers'] if row['zohoId'] and x['id'] == 'zoho-' + row['zohoId']), None) \
                    or next((x for x in data['designers'] if x['name'].casefold() == row['name'].casefold()), None)
                if not d: missing.append(row['name']); continue
                d['skills'] = row['skills']; d['skillNotes'] = row['notes']; matched += 1
            data['skillMatrix'] = {'importedAt': now(), 'by': user['id'], 'matched': matched, 'missing': missing}
        return change(request, revision, ['design-head'], op)

    @app.post('/api/sunroof/presence')
    def presence(body: Presence, request: Request):
        # Punch in / out for the day (meeting A 2:29-3:08). Lapses at midnight; idle sign-out does not end it.
        def op(data, user, order, db):
            target = body.staffId or user['staffId']
            if target != user['staffId'] and user['department'] not in ('design-head', 'admin'): raise HTTPException(403, 'You can only punch yourself in or out.')
            person = next((p for p in data['designers'] + data['workers'] if p['id'] == target), None)
            if not person: raise HTTPException(422, 'No staff record is linked to this login.')
            person['presence'] = {'date': R.today(), 'available': body.available, 'at': now()}
        return change(request, body.revision, ['design', 'design-head', 'measurement'], op)

    @app.post('/api/sunroof/allocation')
    def allocation(body: Allocation, request: Request):
        def op(data, user, order, db): data['allocation'] = body.model_dump(exclude={'revision'})
        return change(request, body.revision, ['design-head'], op)

    @app.get('/api/sunroof/orders/{order_id}/designer-ranking')
    def ranking(order_id: str, request: Request):
        with engine.connect() as db:
            _, _, data = read(db); user = identity(db, request, data); permitted(user, ['design-head'])
            order = next((o for o in data['orders'] if o['id'] == order_id), None)
            if not order: raise HTTPException(404, 'Order not found.')
            return {'ranking': R.rank_designers(order, data['designers'], data['orders'], data.get('allocation'))}

    def auto_assign(data, user, order):
        ranked = R.rank_designers(order, data['designers'], data['orders'], data.get('allocation'))
        if not ranked: raise HTTPException(422, 'No designer can take this order. Add designers or raise capacity.')
        best = ranked[0]
        if not best['eligible']: raise HTTPException(422, 'No designer is rated for this order yet. Rate the team in the skill matrix.')
        order.update(designerId=best['designerId'], assignedAt=now())
        if order['stage'] == 'assignment': order['stage'] = 'measurement'
        lakh = lambda paise: f"₹{paise / R.LAKH:.1f} lakh"
        record(order, user, f"Designer auto-assigned: {best['name']} (skill {best['lowest']}+ for {', '.join(best['traits'])}; "
                            f"{lakh(best['assigned'])} of {lakh(best['target'])} assigned this month)")

    @app.post('/api/sunroof/orders/{order_id}/auto-assign')
    def auto_assign_one(order_id: str, body: Input, request: Request):
        return change(request, body.revision, ['design-head'], lambda data, user, order, db: auto_assign(data, user, order), order_id)

    @app.post('/api/sunroof/auto-assign')
    def auto_assign_all(body: Input, request: Request):
        def op(data, user, order, db):
            waiting = [o for o in data['orders'] if not o.get('designerId') or o.get('stage') == 'assignment']
            if not waiting: raise HTTPException(422, 'Every order already has a designer.')
            for o in waiting:
                before = len(o.get('history', []))
                auto_assign(data, user, o); tell_owners(data, user, o, 'design-head', before)
        return change(request, body.revision, ['design-head'], op)

    @app.post('/api/sunroof/members')
    def member(body: Membership, request: Request):
        def op(data, user, order, db):
            if not db.execute(select(users.c.id).where(users.c.id == body.userId, users.c.active == 1)).first(): raise HTTPException(422, 'Create the user account first.')
            if body.department in ('design', 'measurement'):
                roster = data['designers'] if body.department == 'design' else data['workers']
                if not any(p['id'] == body.staffId for p in roster): raise HTTPException(422, 'Choose a valid staff record.')
            data['members'] = [m for m in data['members'] if m['userId'] != body.userId] + [body.model_dump(exclude={'revision'})]
        return change(request, body.revision, [], op)

    @app.post('/api/sunroof/staff-sync')
    def staff_sync(body: Input, request: Request):
        # Read-only Zoho lookup: active Designers and Installation Managers are added; nothing is written to Zoho.
        from .sunroof_zoho import staff, merge, ZohoError
        try: people = staff()
        except ZohoError as error: raise HTTPException(502, str(error)) from None
        def op(data, user, order, db):
            added = merge(data, people)
            data['staffSyncedAt'] = now(); data['staffSyncAdded'] = added
        return change(request, body.revision, ['design-head'], op)

    @app.post('/api/sunroof/orders/{order_id}/assignment')
    def assign(order_id: str, body: Assignment, request: Request):
        def op(data, user, order, db):
            designer = next((d for d in data['designers'] if d['id'] == body.designerId), None)
            if not designer: raise HTTPException(422, 'Choose a designer from the team.')
            order.update(designerId=designer['id'], assignedAt=now())
            if order['stage'] == 'assignment': order['stage'] = 'measurement'
            record(order, user, 'Designer assigned: ' + designer['name'])
        return change(request, body.revision, ['design-head'], op, order_id)

    # ------------------------------------------------------------ order details

    @app.post('/api/sunroof/orders/{order_id}/contact')
    def contact(order_id: str, body: Contact, request: Request):
        # The designer fills in what Sales left out instead of sending it back (owner, 14 Nov).
        def op(data, user, order, db):
            new = {k: v for k, v in body.model_dump(exclude={'revision'}).items() if v is not None and v != order.get(k)}
            if not new: raise HTTPException(422, 'Nothing changed.')
            order.update(new); record(order, user, 'Client details updated: ' + ', '.join(new))
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/profile')
    def profile(order_id: str, body: Profile, request: Request):
        def op(data, user, order, db):
            new = {k: v for k, v in body.model_dump(exclude={'revision'}).items() if v is not None and v != order.get(k)}
            if not new: raise HTTPException(422, 'Nothing changed.')
            order.update(new); record(order, user, 'Project profile updated: ' + ', '.join(new))
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/money')
    def money(order_id: str, body: Money, request: Request):
        def op(data, user, order, db):
            new = {k: v for k, v in body.model_dump(exclude={'revision'}).items() if v is not None and v != order.get(k)}
            if not new: raise HTTPException(422, 'Nothing changed.')
            order.update(new); record(order, user, 'Payment plan updated: ' + ', '.join(new))
        return change(request, body.revision, ['accounts'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/areas')
    def add_area(order_id: str, body: Area, request: Request):
        # Designers add an area/sub-order under an existing project (confirmed 13 Nov). It runs its own workflow.
        def op(data, user, parent, db):
            root = next((o for o in data['orders'] if o['id'] == parent.get('parentId')), parent)
            if root.get('stage') in ('dispatched', 'cleared'): raise HTTPException(422, 'This project has been dispatched; areas can no longer be added.')
            siblings = [o for o in data['orders'] if o.get('parentId') == root['id']]
            area = {k: root.get(k) for k in ('client', 'location', 'city', 'state', 'country', 'phone', 'email', 'shippingAddress', 'designerId',
                                             'plan', 'celebrity', 'projectType', 'architect', 'poc', 'pocPhone', 'billingName', 'customerId', 'projectId') if root.get(k) is not None}
            area.update({'id': str(uuid4()), 'reference': f"{root['reference']}/{len(siblings) + 2}", 'parentId': root['id'], 'area': body.name,
                         'models': body.models, 'value': body.value, 'shipWithParent': body.shipWithParent, 'squareFeet': 0,
                         'stage': 'measurement' if root.get('designerId') else 'assignment', 'createdAt': now(), 'history': [],
                         'assignedAt': now()})
            if body.value is None: area.pop('value')
            data['orders'].append(area)
            record(area, user, f"Area added under {root['reference']}: {body.name}" + (' · ships with the main order' if body.shipWithParent else ''))
            record(root, user, f"Area added: {area['reference']} {body.name}")
        return change(request, body.revision, DESIGN, op, order_id)

    # ------------------------------------------------------------ measurement and PDI visits

    def visit_times(body):
        if body.date is not None and body.slot is not None:
            try: return R.slot_times(body.date, body.slot, body.slots)
            except ValueError as error: raise HTTPException(422, str(error)) from None
        if body.start and body.end: return body.start, body.end
        return None, None

    def slot(data, worker_id, start, end, skip=None):
        if start >= end or start < datetime.now(timezone.utc): raise HTTPException(422, 'Choose a future visit with an end time after its start.')
        if (end-start).total_seconds() > 86400: raise HTTPException(422, 'A visit must fit within 24 hours.')
        if R.busy(data['orders'], worker_id, start, end, skip): raise HTTPException(409, 'That person is already booked during this time. Choose another slot.')

    def book_visit(data, user, order, worker_id, start, end, kind):
        if kind == 'measurement' and order['stage'] != 'measurement': raise HTTPException(422, 'This order is not awaiting measurement.')
        if kind == 'pdi' and not order.get('clientApproved'): raise HTTPException(422, 'Client-approved drawings are required before PDI.')
        if any(v['kind'] == kind and v['status'] not in ('rejected', 'approved') for v in order.get('visits', [])): raise HTTPException(422, 'This order already has an open visit.')
        worker = next((w for w in data['workers'] if w['id'] == worker_id), None)
        if not worker: raise HTTPException(422, 'Choose a measurement team member.')
        slot(data, worker_id, start, end)
        order.setdefault('visits', []).append({'id': str(uuid4()), 'kind': kind, 'workerId': worker_id,
            'start': start.isoformat(), 'end': end.isoformat(), 'status': 'confirmed' if worker['kind'] == 'executive' else 'pending',
            'checklist': [], 'documents': [], 'reschedules': 0, 'log': []})
        notify(data, 'worker:' + worker_id, order, f"{'PDI' if kind == 'pdi' else 'Measurement'} assigned: {order.get('client', '')} · {start.astimezone(R.IST):%d %b %H:%M}")
        record(order, user, ('PDI' if kind == 'pdi' else 'Measurement') + ' booked with ' + worker['name'] + f" · {start.astimezone(R.IST):%d %b %H:%M}")

    @app.get('/api/sunroof/calendar')
    def calendar(request: Request, start: Date | None = None, days: int = 14, orderId: str = ''):
        # Every visit person's three daily slots, so the designer can see who is free when (owner, 14 Nov).
        with engine.connect() as db:
            _, _, data = read(db); user = identity(db, request, data); permitted(user, DESIGN + ['measurement'])
            order = next((o for o in data['orders'] if o['id'] == orderId and scoped(o, user)), None)
            first = start or datetime.now(R.IST).date()
            return {'slots': [[a.strftime('%H:%M'), b.strftime('%H:%M')] for a, b in R.SLOTS],
                    'people': R.calendar(data['orders'], data['workers'], first, max(1, min(days, 31)), order),
                    'suggestion': R.suggest_visit(data['orders'], data['workers'], order, first) if order else None}

    @app.post('/api/sunroof/orders/{order_id}/visits')
    def book(order_id: str, body: Booking, request: Request):
        def op(data, user, order, db):
            start, end = visit_times(body)
            if not start: raise HTTPException(422, 'Choose a date and slot, or a start and end time.')
            book_visit(data, user, order, body.workerId, start, end, body.kind)
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/visits/auto')
    def book_auto(order_id: str, body: AutoBooking, request: Request):
        # Automatic measurement assignment: nearest person, earliest free slot (owner, 14 Nov).
        def op(data, user, order, db):
            pick = R.suggest_visit(data['orders'], data['workers'], order)
            if not pick: raise HTTPException(422, 'Nobody who covers this city has a free slot in the next 14 days. Book manually.')
            start, end = R.slot_times(Date.fromisoformat(pick['date']), pick['slot'])
            book_visit(data, user, order, pick['workerId'], start, end, body.kind)
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/visits/{visit_id}')
    def visit_action(order_id: str, visit_id: str, body: VisitAction, request: Request):
        def op(data, user, order, db):
            visit = next((v for v in order.get('visits', []) if v['id'] == visit_id), None)
            if not visit or (user['department'] == 'measurement' and visit['workerId'] != user['staffId']): raise HTTPException(404, 'Visit not found.')
            worker = next(w for w in data['workers'] if w['id'] == visit['workerId'])
            a = body.action
            if a in ('accept', 'reject'):
                if worker['kind'] != 'installation_manager': raise HTTPException(422, 'Measurement Executive bookings are confirmed directly and cannot be changed by the executive.')
                if visit['status'] not in ('pending', 'confirmed'): raise HTTPException(422, 'This visit cannot be accepted or declined now.')
                if a == 'reject':
                    if not body.reason: raise HTTPException(422, 'A reason is required.')
                    visit.update(status='rejected', reason=body.reason)
                else: visit.update(status='confirmed')
            elif a == 'reschedule':
                # Both Executives and Installation Managers may reschedule after speaking to the client; every one is counted.
                if visit['status'] not in ('pending', 'confirmed'): raise HTTPException(422, 'This visit cannot be rescheduled now.')
                if not body.reason or not body.contact: raise HTTPException(422, 'Say who you spoke to and why the visit moves.')
                start, end = visit_times(body)
                if not start: raise HTTPException(422, 'Choose the new date and slot.')
                slot(data, visit['workerId'], start, end, visit_id)
                visit['reschedules'] = visit.get('reschedules', 0) + 1
                visit.setdefault('log', []).append({'at': now(), 'by': user['id'], 'from': visit['start'], 'to': start.isoformat(), 'contact': body.contact, 'reason': body.reason})
                visit.update(status='confirmed', start=start.isoformat(), end=end.isoformat(), reason=body.reason)
                if visit['reschedules'] >= RESCHEDULE_FLAG: record(order, user, f"Flag: visit rescheduled {visit['reschedules']} times")
            elif a == 'depart':
                if visit['status'] != 'confirmed': raise HTTPException(422, 'Only a confirmed visit can start.')
                visit.update(status='departed', departedAt=now())
            elif a == 'arrive':
                if visit['status'] not in ('confirmed', 'departed'): raise HTTPException(422, 'This visit is not on its way.')
                late = int((datetime.now(timezone.utc) - datetime.fromisoformat(visit['start'])).total_seconds() // 60)
                visit.update(status='arrived', arrivedAt=now(), lateMinutes=max(0, late))
                if body.latitude is not None and body.longitude is not None: visit['arrivalLocation'] = [body.latitude, body.longitude]
            else:
                if visit['status'] not in ('confirmed', 'departed', 'arrived', 'corrections'): raise HTTPException(422, 'Confirm the visit before submitting results.')
                if not body.checklist or any(not x.strip() for x in body.checklist): raise HTTPException(422, 'Complete the measurement checklist.')
                docs = [d for d in order.get('documents', []) if d['id'] in body.documents and d.get('visitId') == visit_id]
                if not any(d['kind'] == 'drawing' for d in docs) or not any(d['kind'] == 'photo' for d in docs): raise HTTPException(422, 'Upload measurement drawings and site photos before submitting.')
                visit.update(status='submitted', checklist=body.checklist, documents=body.documents, submittedAt=now())
            words = {'depart': 'on the way', 'arrive': 'reached site' + (f" ({visit.get('lateMinutes')} min late)" if visit.get('lateMinutes') else ''),
                     'submit': 'done, sent for review', 'reschedule': f"rescheduled after speaking to {body.contact}"}
            record(order, user, 'Visit ' + words.get(a, a) + (' · ' + body.reason if body.reason and a != 'submit' else ''))
        return change(request, body.revision, ['measurement'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/visits/{visit_id}/review')
    def review_visit(order_id: str, visit_id: str, body: Review, request: Request):
        def op(data, user, order, db):
            visit = next((v for v in order.get('visits', []) if v['id'] == visit_id), None)
            if not visit or visit['status'] != 'submitted': raise HTTPException(422, 'No measurement submission is awaiting review.')
            if not body.approve and not body.reason: raise HTTPException(422, 'Explain the corrections needed.')
            visit.update(status='approved' if body.approve else 'corrections', reviewNote=body.reason)
            if body.approve and visit['kind'] == 'measurement': order['stage'] = 'drawings'
            if body.approve and visit['kind'] == 'pdi': order['pdiApproved'] = True
            if not body.approve: notify(data, 'worker:' + visit['workerId'], order, 'Corrections requested: ' + body.reason)
            record(order, user, 'Designer approved visit' if body.approve else 'Designer requested corrections: ' + body.reason)
        return change(request, body.revision, DESIGN, op, order_id)

    # ------------------------------------------------------------ payments

    def auto_request(order, user):
        """Once a part's dispatch payment is verified the part is requested for dispatch (owner, 14 Nov)."""
        if order.get('stage') != 'dispatch': return
        parts = order.setdefault('dispatch', {})
        rafter = parts.get('rafter', {})
        if not rafter.get('status') and R.balance(order, 'rafter') == 0:
            parts['rafter'] = {'status': 'requested', 'at': now()}; record(order, user, 'Rafters requested for dispatch (payment verified)')
        elif rafter.get('status') == 'dispatched' and not parts.get('console', {}).get('status') and R.balance(order, 'dispatch') == 0:
            parts['console'] = {'status': 'requested', 'at': now()}; record(order, user, 'Consoles requested for dispatch (payment verified)')

    @app.post('/api/sunroof/orders/{order_id}/receipts')
    def submit_receipt(order_id: str, body: Receipt, request: Request):
        def op(data, user, order, db):
            if any(r['reference'].casefold() == body.reference.casefold() for r in order.get('receipts', []) if r['status'] != 'rejected'): raise HTTPException(422, 'This payment reference is already recorded.')
            order.setdefault('receipts', []).append({**body.model_dump(mode='json', exclude={'revision'}), 'id': str(uuid4()), 'status': 'requested', 'submittedAt': now()})
            notify(data, 'dept:accounts', order, f"Payment to verify: {order.get('client', '')} · ₹{body.amount / 100:,.0f}")
            record(order, user, 'Payment submitted to Accounts for verification')
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/receipts/{receipt_id}/review')
    def review_receipt(order_id: str, receipt_id: str, body: ReceiptReview, request: Request):
        def op(data, user, order, db):
            receipt = next((r for r in order.get('receipts', []) if r['id'] == receipt_id), None)
            if not receipt or receipt['status'] != 'requested': raise HTTPException(422, 'Payment is not awaiting verification.')
            if not body.approve and not body.reason: raise HTTPException(422, 'A rejection reason is mandatory.')
            receipt.update(status='confirmed' if body.approve else 'rejected', reason=body.reason, notes=body.notes, reviewedAt=now(), reviewedBy=user['id'])
            record(order, user, 'Payment confirmed by Accounts' if body.approve else 'Payment rejected by Accounts: ' + body.reason)
            if body.approve: auto_request(order, user)
        return change(request, body.revision, ['accounts'], op, order_id)

    # ------------------------------------------------------------ design and client approval

    def design_stage(order):
        if order['stage'] != 'drawings': raise HTTPException(422, 'This order is not in design. Approve the measurement first.')

    @app.post('/api/sunroof/orders/{order_id}/design-start')
    def design_start(order_id: str, body: Input, request: Request):
        # Kept apart from "measurement done" so client holds and design time stay visible (meeting B 9:23-9:43).
        def op(data, user, order, db):
            design_stage(order)
            if order.get('designStartedAt'): raise HTTPException(422, 'Design has already started.')
            order['designStartedAt'] = now(); record(order, user, 'Design started')
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/drawings')
    def submit_drawing(order_id: str, body: DrawingVersion, request: Request):
        def op(data, user, order, db):
            design_stage(order)
            if order.get('clientApproved'): raise HTTPException(422, 'The client has already approved a version.')
            drawings = order.setdefault('drawings', [])
            if drawings and drawings[-1]['status'] in ('awaiting_head', 'ready'): raise HTTPException(422, 'Wait for the decision on the current version first.')
            docs = {d['id']: d for d in order.get('documents', []) if not d.get('visitId')}
            used = {x for d in drawings for x in (d['cad'], d['pdf'])}
            if docs.get(body.cad, {}).get('kind') != 'cad' or docs.get(body.pdf, {}).get('kind') != 'client_pdf' or {body.cad, body.pdf} & used:
                raise HTTPException(422, 'Upload a new CAD file and a new client PDF for this version.')
            version = len(drawings) + 1
            drawings.append({'version': version, 'cad': body.cad, 'pdf': body.pdf, 'note': body.note, 'submittedAt': now(),
                             'status': 'awaiting_head' if version >= 4 else 'ready'})
            order.setdefault('designStartedAt', now())
            if version >= 4: notify(data, 'dept:design-head', order, f"V{version} needs your approval: {order.get('client', '')}")
            record(order, user, f'Drawing V{version} submitted' + (' · needs Design Head approval' if version >= 4 else ''))
        return change(request, body.revision, DESIGN, op, order_id)

    def current_drawing(order, version, status):
        drawing = next((d for d in order.get('drawings', []) if d['version'] == version), None)
        if not drawing or drawing['status'] != status or drawing is not order['drawings'][-1]: raise HTTPException(422, 'This version is not awaiting that decision.')
        return drawing

    @app.post('/api/sunroof/orders/{order_id}/drawings/{version}/head')
    def head_review(order_id: str, version: int, body: Review, request: Request):
        # V4 and later go to Shivang before the client sees them (meeting B 3:12-3:18).
        def op(data, user, order, db):
            drawing = current_drawing(order, version, 'awaiting_head')
            if not body.approve and not body.reason: raise HTTPException(422, 'Explain what the designer must change.')
            drawing.update(status='ready' if body.approve else 'returned', headNote=body.reason, headAt=now())
            record(order, user, f'Design Head approved V{version}' if body.approve else f'Design Head returned V{version}: {body.reason}')
        return change(request, body.revision, ['design-head'], op, order_id)

    def public_base(request):
        configured = os.environ.get('CRM_PUBLIC_URL', '').rstrip('/')
        if configured: return configured
        host = request.headers.get('x-forwarded-host')
        if host: return f"{request.headers.get('x-forwarded-proto', 'http')}://{host}"
        return (settings.origin if settings else str(request.base_url)).rstrip('/')

    @app.post('/api/sunroof/orders/{order_id}/drawings/{version}/send')
    def send_drawing(order_id: str, version: int, body: SendDrawing, request: Request):
        # Email the client a link to this exact version; the same link can be copied or sent on WhatsApp (owner, 14 Nov).
        base = public_base(request)
        def op(data, user, order, db):
            drawing = current_drawing(order, version, 'ready')
            email = body.email or order.get('email') or ''
            if body.email and body.email != order.get('email'): order['email'] = body.email
            token = secrets.token_urlsafe(24)
            link = f'{base}/client/{token}'
            text = f"Hello {order.get('client', '')}, your Sunrooof design V{version} is ready for your approval: {link}"
            share = {'hash': hashlib.sha256(token.encode()).hexdigest(), 'link': link, 'email': email, 'sentAt': now(), 'sentBy': user['id'],
                     'expires': (datetime.now(timezone.utc) + timedelta(days=LINK_DAYS)).isoformat(),
                     'whatsapp': 'whatsapp://send?text=' + urllib.parse.quote(text), 'whatsappWeb': 'https://wa.me/?text=' + urllib.parse.quote(text)}
            share['mail'] = 'not requested'
            if email:
                from mail import send as mailer
                try:
                    result = mailer.send_to(email, f'Your Sunrooof design V{version} for approval',
                        f"{text}\n\nOpen the link to see the design and approve it, or tell us what to change.\nThe link works for {LINK_DAYS} days.\n\nSunrooof")
                    share['mail'] = 'sent (test mode)' if result.get('test') else 'sent'
                except mailer.NoKey: share['mail'] = 'not sent: mailbox not set up'
                except mailer.Failed as problem: share['mail'] = f'not sent: {problem}'
            drawing['share'] = share
            record(order, user, f'V{version} sent to client · email {share["mail"]}')
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/drawings/{version}/client')
    def client_decision(order_id: str, version: int, body: Review, request: Request):
        # Designer records the client's answer when it comes by phone or WhatsApp (meeting B 2:30-3:10).
        def op(data, user, order, db):
            decide(order, version, body.approve, body.reason, user['id'])
            record(order, user, f'Client approved V{version}' if body.approve else f'Client rejected V{version}: {body.reason}')
        return change(request, body.revision, DESIGN, op, order_id)

    def decide(order, version, approve, reason, by):
        drawing = current_drawing(order, version, 'ready')
        if not approve and not reason: raise HTTPException(422, "Record the client's reason for rejecting.")
        drawing.update(status='approved' if approve else 'rejected', clientReason=reason, decidedAt=now(), decidedBy=by)
        drawing.pop('share', None) if not approve else drawing.get('share', {}).update(used=now())
        if approve: order['clientApproved'] = True

    def by_token(data, token):
        digest = hashlib.sha256(token.encode()).hexdigest()
        for order in data['orders']:
            for d in order.get('drawings', []):
                share = d.get('share') or {}
                if share.get('hash') and secrets.compare_digest(share['hash'], digest):
                    if datetime.fromisoformat(share['expires']) < datetime.now(timezone.utc): raise HTTPException(410, 'This link has expired. Ask your designer for a new one.')
                    return order, d
        raise HTTPException(404, 'This link is not valid any more. Ask your designer for the latest one.')

    @app.get('/client/{token}')
    def client_page(token: str):
        with engine.connect() as db:
            _, _, data = read(db)
            try: order, d = by_token(data, token)
            except HTTPException as error: return HTMLResponse(page('Link unavailable', f'<p>{html.escape(str(error.detail))}</p>'), status_code=error.status_code)
        open_ = d['status'] == 'ready' and d is order['drawings'][-1]
        done = {'approved': 'You approved this design. Thank you!', 'rejected': 'You asked for changes. Your designer will send a new version.'}.get(d['status'], 'A newer version replaced this one.')
        body = (f"<p>Hello {html.escape(order.get('client', ''))},</p><p>Your design <strong>V{d['version']}</strong> is ready.</p>"
                f"<p><a class='btn' href='/client/{html.escape(token)}/file' target='_blank' rel='noopener'>Open the design (PDF)</a></p>")
        body += (("<form id='f'><label>What should change? (needed if you reject)<textarea name='reason' maxlength='2000'></textarea></label>"
                  "<p><button name='approve' value='1'>Approve design</button> <button name='approve' value='0' class='line'>Ask for changes</button></p></form><p id='m' role='status'></p>"
                  "<script>const f=document.getElementById('f');f.onsubmit=e=>e.preventDefault();f.querySelectorAll('button').forEach(b=>b.onclick=async()=>{"
                  "const r=f.reason.value.trim(),a=b.value==='1';if(!a&&!r){m.textContent='Please tell us what should change.';return}"
                  "const x=await fetch(location.pathname+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approve:a,reason:r})});"
                  "const j=await x.json().catch(()=>({}));if(x.ok){f.remove();m.textContent=a?'Thank you, the design is approved.':'Thank you, we will send a new version.'}else m.textContent=j.error||'Please try again.'})</script>")
                 if open_ else f'<p>{done}</p>')
        return HTMLResponse(page('Your Sunrooof design', body))

    @app.get('/client/{token}/file')
    def client_file(token: str):
        with engine.connect() as db:
            _, _, data = read(db); order, d = by_token(data, token)
            doc = next((x for x in order.get('documents', []) if x['id'] == d['pdf']), None)
            if not doc or settings is None: raise HTTPException(404, 'File not found.')
            root = (settings.uploads / 'sunroof').resolve(); path = (root / doc['filename']).resolve()
            if path.parent != root or not path.is_file(): raise HTTPException(404, 'File unavailable.')
            return FileResponse(path, media_type=doc['mime'], filename=f"{order['reference']}-V{d['version']}.pdf")

    @app.post('/client/{token}/decision')
    def client_link_decision(token: str, body: ClientDecision):
        with engine.begin() as db:
            rev, payload, data = read(db)
            order, d = by_token(data, token)
            before = R.journey(order)['owner']; start = len(order.get('history', []))
            decide(order, d['version'], body.approve, body.reason, 'client-link')
            order['history'].append({'at': now(), 'by': 'client-link', 'text': (f"Client approved V{d['version']} by link" if body.approve else f"Client asked for changes on V{d['version']}: {body.reason}")})
            tell_owners(data, {'id': 'client-link', 'department': 'client', 'staffId': ''}, order, before, start)
            changed = db.execute(update(state).where(state.c.id == 1, state.c.rev == rev).values(rev=rev + 1, payload=payload))
            if changed.rowcount != 1: raise HTTPException(409, 'Please try again in a moment.')
            event(db, 'client-link', 'sunroof.client.decision', order['id'])
        return {'ok': True}

    # ------------------------------------------------------------ dates and factory

    @app.post('/api/sunroof/orders/{order_id}/dates')
    def key_dates(order_id: str, body: KeyDates, request: Request):
        def op(data, user, order, db):
            dates = order.setdefault('dates', {})
            new = body.model_dump(mode='json', exclude={'revision'})
            if user['department'] == 'factory':  # the factory may move only the required date (owner, 14 Nov)
                new = {'requiredDispatch': new['requiredDispatch']}
                if not new['requiredDispatch']: raise HTTPException(422, 'Enter the new required date.')
            changed = [k for k, v in new.items() if dates.get(k) != v]
            if not changed: raise HTTPException(422, 'No date changed.')
            dates.update(new)
            record(order, user, 'Dates updated: ' + ', '.join(f"{k} {new[k] or 'cleared'}" for k in changed))
        return change(request, body.revision, DESIGN + ['factory'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/handover')
    def send_to_factory(order_id: str, body: Handover, request: Request):
        def op(data, user, order, db):
            design_stage(order)
            if not order.get('clientApproved'): raise HTTPException(422, 'The client must approve a drawing version first.')
            due = R.balance(order, 'production')
            if due is None: raise HTTPException(422, 'The production amount due is not recorded yet. Ask Accounts.')
            if due > 0: raise HTTPException(422, 'Production payment is not fully confirmed by Accounts yet.')
            if not order.get('dates', {}).get('requiredDispatch'): raise HTTPException(422, 'Enter the date the client needs the product, so the factory can plan.')
            if not str(order.get('shippingAddress') or '').strip(): raise HTTPException(422, 'Shipping address is missing. Add it in client details.')
            pdi = [v for v in order.get('visits', []) if v['kind'] == 'pdi' and v['status'] != 'rejected']
            if body.pdiRequired and not any(v['status'] == 'approved' for v in pdi):
                raise HTTPException(422, 'PDI is required. Book it and approve the PDI before sending to the factory.' if not pdi else 'PDI is booked. Approve it before sending to the factory.')
            order.update(stage='handover', handedOverAt=now(), pdiRequired=body.pdiRequired)
            needed = order['dates']['requiredDispatch']
            from mail import send as mailer
            try:
                result = mailer.send_to(mailer.factory_address(), f"New order for production: {order['reference']} · {order.get('client', '')}",
                    f"Order {order['reference']} for {order.get('client', '')} is handed over to the factory.\nRequired by: {needed}\n"
                    f"PDI required: {'Yes' if body.pdiRequired else 'No'}\nModels: " + ', '.join(f"{m.get('code')} × {m.get('quantity')}" for m in order.get('models', [])))
                mail = 'sent (test mode)' if result.get('test') else 'sent'
            except mailer.NoKey: mail = 'not sent: mailbox not set up'
            except mailer.Failed as problem: mail = f'not sent: {problem}'
            notify(data, 'dept:factory', order, f"New handover: {order.get('client', '')} · needed by {needed}")
            record(order, user, f"Sent to factory · PDI {'required' if body.pdiRequired else 'not required'} · needed by {needed} · factory email {mail}")
        return change(request, body.revision, DESIGN, op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/factory')
    def factory_action(order_id: str, body: FactoryAction, request: Request):
        def op(data, user, order, db):
            if order['stage'] not in FACTORY_STAGES: raise HTTPException(422, 'This order has not been handed to the factory.')
            action = body.action
            if action == 'issue':
                if not body.reason: raise HTTPException(422, 'Describe the issue.')
                order.setdefault('issues', []).append({'id': str(uuid4()), 'text': body.reason, 'at': now(), 'status': 'open'})
                # No automatic stage change: blocking policy is explicitly undecided.
            elif action == 'accept':
                if order['stage'] != 'handover' or order.get('factoryAccepted'): raise HTTPException(422, 'Handover is not awaiting acceptance.')
                order['factoryAccepted'] = now()
            elif action == 'start':
                if order['stage'] != 'handover' or not order.get('factoryAccepted'): raise HTTPException(422, 'Accept the handover first.')
                if order.get('issues'): raise HTTPException(422, 'Issue-handling policy is flagged. Starting an order with reported issues is not implemented yet.')
                order.update(stage='production', productionStartedAt=now())
            elif action == 'complete':
                if order['stage'] not in ('production', 'repair', 'reproduce'): raise HTTPException(422, 'Production has not started.')
                order.update(stage='qc', productionCompletedAt=now())
            elif action in ('qc_pass', 'qc_fail'):
                if order['stage'] != 'qc': raise HTTPException(422, 'This order is not awaiting QC.')
                remedy = 'replace' if body.remedy == 'reproduce' else body.remedy
                if action == 'qc_fail':
                    # Repair or replacement both go back to production, then QC again (owner, 14 Nov).
                    if not body.reason or not remedy: raise HTTPException(422, 'Choose repair or replace and provide a reason.')
                    order.update(stage='production')
                else: order.update(stage='packing', qcPassedAt=now())
                order.setdefault('qc', []).append({'at': now(), 'passed': action == 'qc_pass', 'reason': body.reason, 'remedy': remedy})
            elif action == 'packed':
                if order['stage'] != 'packing' or not order.get('qcPassedAt'): raise HTTPException(422, 'QC must pass before packing.')
                order.update(packedAt=now(), stage='dispatch')
                auto_request(order, user)
            words = {'accept': 'accepted the handover', 'start': 'production started', 'complete': 'production complete, QC next',
                     'qc_pass': 'QC passed', 'qc_fail': f"QC failed, {('replace' if body.remedy == 'reproduce' else body.remedy)}", 'packed': 'ready & packed', 'issue': 'issue reported'}
            record(order, user, 'Factory: ' + words[action] + (' · ' + body.reason if body.reason else ''))
        return change(request, body.revision, ['factory'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/dispatch')
    def dispatch(order_id: str, body: DispatchAction, request: Request):
        """Rafters first, then consoles. The designer requests; the dispatch team (factory login for now) does the rest."""
        def op(data, user, order, db):
            if order['stage'] != 'dispatch': raise HTTPException(422, 'The order is not packed yet.')
            parts = order.setdefault('dispatch', {})
            part = parts.setdefault(body.part, {})
            milestone = 'rafter' if body.part == 'rafter' else 'dispatch'
            if body.part == 'console' and parts.get('rafter', {}).get('status') != 'dispatched': raise HTTPException(422, 'Rafters go first. Dispatch the rafters before the consoles.')
            if body.action == 'request':
                if user['department'] not in ('design', 'design-head', 'admin'): raise HTTPException(403, 'The designer requests dispatch.')
                if part.get('status'): raise HTTPException(422, 'Dispatch is already requested.')
                due = R.balance(order, milestone)
                if due is None: raise HTTPException(422, 'The dispatch amount due is not recorded yet. Ask Accounts.')
                if due > 0: raise HTTPException(422, 'The dispatch payment is not fully confirmed by Accounts yet.')
                part.update(status='requested', at=now())
                notify(data, 'dept:factory', order, f"Dispatch requested ({body.part}s): {order.get('client', '')}")
            else:
                if user['department'] not in ('factory', 'admin'): raise HTTPException(403, 'The dispatch team updates dispatch progress.')
                expected = 'requested' if body.action == 'ready' else 'ready'
                if part.get('status') != expected: raise HTTPException(422, f"This part is not {expected} yet.")
                part.update(status=body.action, **{body.action + 'At': now()})
                if body.action == 'dispatched' and body.part == 'console': order['stage'] = 'dispatched'
                if body.action == 'dispatched' and body.part == 'rafter': auto_request(order, user)
            words = {'request': 'requested for dispatch', 'ready': 'ready to dispatch', 'dispatched': 'dispatched'}
            record(order, user, f"{body.part.capitalize()}s {words[body.action]}" + (' · ' + body.note if body.note else ''))
        return change(request, body.revision, DESIGN + ['factory'], op, order_id)

    @app.post('/api/sunroof/notifications/seen')
    def seen(body: Input, request: Request):
        # Opening the bell clears the red count (per person).
        def op(data, user, order, db):
            data.setdefault('seen', {}).setdefault(user['id'], {})['at'] = now()
        return change(request, body.revision, DEPARTMENTS, op)

    @app.post('/api/sunroof/notifications/hide')
    def hide(body: Seen, request: Request):
        # A cross removes one line; Clear all empties a column. Only for you; others keep theirs.
        def op(data, user, order, db):
            visible = inbox(data, user)
            chosen = [n['id'] for n in visible if (n['id'] in body.ids) or (body.column and n['column'] == body.column)]
            if not chosen: raise HTTPException(422, 'Nothing to clear.')
            # Hiding a line also hides its repeats for the same client.
            same = {(n.get('orderId'), n['text']) for n in visible if n['id'] in chosen}
            chosen += [n['id'] for n in data['notifications'] if (n.get('orderId'), n['text']) in same]
            mine = data.setdefault('seen', {}).setdefault(user['id'], {})
            mine['hidden'] = list(dict.fromkeys(mine.get('hidden', []) + chosen))[-2000:]
        return change(request, body.revision, DEPARTMENTS, op)

    @app.post('/api/sunroof/tasks/{order_id}/report')
    def report_task(order_id: str, body: TaskReport, request: Request):
        """The person a task is for says whether it is done; the person who gave it is told.
        Tasks themselves come from the workflow, so nobody creates or reassigns them here."""
        def op(data, user, order, db):
            task = order.get('task') or (R.task_of(order) and {**R.task_of(order), 'id': order['id'] + ':current', 'by': '', 'byId': '', 'since': ''})
            if not task: raise HTTPException(422, 'This order has no open task.')
            if task['to'] not in keys_of(user) and user['department'] != 'admin': raise HTTPException(403, 'This task is not yours.')
            if body.status == 'not_done' and not body.note: raise HTTPException(422, 'Say why it is not done.')
            task['report'] = {'status': body.status, 'note': body.note, 'at': now(), 'by': person_name(data, user)}
            order['task'] = task
            words = 'done' if body.status == 'done' else 'not done'
            record(order, user, f"Task {words}: {task['title']}" + (f' · {body.note}' if body.note else ''))
            if task.get('byKey'): notify(data, task['byKey'], order, f"{person_name(data, user)}: {task['title']} — {words}" + (f' · {body.note}' if body.note else ''))
        return change(request, body.revision, DEPARTMENTS, op, order_id)

    # ------------------------------------------------------------ files

    @app.put('/api/sunroof/orders/{order_id}/documents')
    async def upload(order_id: str, request: Request, revision: int, kind: Literal['drawing', 'photo', 'cad', 'client_pdf'], visitId: str = ''):
        # Local preview storage only; never silently fall back from hosted object storage.
        if settings is None or settings.storage_backend != 'filesystem': raise HTTPException(503, 'Sunroof document storage is not configured for this environment.')
        raw = await request.body()
        mime = request.headers.get('content-type', '').split(';')[0]
        types = {'application/pdf': ('.pdf', raw.startswith(b'%PDF-')), 'image/png': ('.png', raw.startswith(b'\x89PNG\r\n\x1a\n')), 'image/jpeg': ('.jpg', raw.startswith(b'\xff\xd8\xff'))}
        if kind == 'cad': types = {'application/pdf': types['application/pdf'], 'application/acad': ('.dwg', raw.startswith(b'AC10')), 'image/vnd.dwg': ('.dwg', raw.startswith(b'AC10'))}
        if kind == 'client_pdf': types = {'application/pdf': types['application/pdf']}
        if mime not in types or not types[mime][1] or not 0 < len(raw) <= 20*1024*1024 or (kind == 'photo' and mime == 'application/pdf'): raise HTTPException(422, 'Use a valid file up to 20 MB: PDF/PNG/JPEG for visits, DWG or PDF for CAD, PDF for the client copy. Photos must be images.')
        file_id = str(uuid4()); path = settings.uploads / 'sunroof' / (file_id + types[mime][0])
        def op(data, user, order, db):
            if kind in ('cad', 'client_pdf'):
                if user['department'] not in ('design', 'design-head', 'admin'): raise HTTPException(403, 'Only Design uploads drawings.')
                design_stage(order)
            else:
                if user['department'] not in ('measurement', 'admin'): raise HTTPException(403, 'Only the visit team uploads visit evidence.')
                target = next((v for v in order.get('visits', []) if v['id'] == visitId and v['status'] in ('confirmed', 'departed', 'arrived', 'corrections')), None)
                if not target or (user['department'] == 'measurement' and target['workerId'] != user['staffId']): raise HTTPException(403, 'No assigned visit is open for submission.')
            path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(raw)
            order.setdefault('documents', []).append({'id': file_id, 'visitId': visitId, 'kind': kind, 'filename': path.name, 'mime': mime})
            record(order, user, 'Uploaded ' + kind.replace('_', ' '))
        try: return change(request, revision, ['measurement', 'design', 'design-head'], op, order_id)
        except Exception:
            path.unlink(missing_ok=True); raise

    @app.get('/api/sunroof/orders/{order_id}/documents/{file_id}')
    def document(order_id: str, file_id: str, request: Request):
        with engine.connect() as db:
            _, _, data = read(db); user = identity(db, request, data)
            order = next((o for o in data['orders'] if o['id'] == order_id and scoped(o, user)), None)
            doc = next((d for d in (order or {}).get('documents', []) if d['id'] == file_id), None)
            if not doc or settings is None: raise HTTPException(404, 'File not found.')
            root = (settings.uploads / 'sunroof').resolve(); path = (root / doc['filename']).resolve()
            if path.parent != root or not path.is_file(): raise HTTPException(404, 'File unavailable.')
            return FileResponse(path, media_type=doc['mime'], filename=doc['filename'])


def page(title, body):
    return (f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(title)}</title><style>body{{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 16px;color:#1d2433;background:#f6f6fc}}"
            "h1{font-size:22px}.brand{font-weight:800;letter-spacing:.08em}a.btn,button{display:inline-block;background:#1d2433;color:#fff;border:0;border-radius:10px;padding:12px 18px;font:inherit;text-decoration:none;cursor:pointer}"
            "button.line{background:#fff;color:#1d2433;border:1px solid #c9c9dc}textarea{display:block;width:100%;min-height:90px;margin-top:6px;font:inherit;border-radius:8px;border:1px solid #c9c9dc;padding:8px}</style></head>"
            f"<body><p class='brand'>SUNROOOF</p><h1>{html.escape(title)}</h1>{body}</body></html>")
