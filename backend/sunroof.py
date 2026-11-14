"""Sunroof departmental workspaces backed by one order record and revision lock."""
from copy import deepcopy
from datetime import datetime, timezone, date as Date
from uuid import uuid4
from typing import Literal
from pathlib import Path
from fastapi import HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime
from sqlalchemy import select, update
from .models import state, users
from .repository import event

DEPARTMENTS = ('design', 'design-head', 'measurement', 'accounts', 'factory')
FACTORY_STAGES = ('handover', 'production', 'qc', 'repair', 'reproduce', 'packing', 'cleared')

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
class Membership(Input):
    userId: str = Field(min_length=1, max_length=100)
    department: Literal['design', 'design-head', 'measurement', 'accounts', 'factory']
    staffId: str = Field(default='', max_length=100)
class Booking(Input):
    workerId: str = Field(min_length=1, max_length=80)
    start: AwareDatetime
    end: AwareDatetime
    kind: Literal['measurement', 'pdi'] = 'measurement'
class VisitAction(Input):
    action: Literal['accept', 'reject', 'reschedule', 'submit']
    start: AwareDatetime | None = None
    end: AwareDatetime | None = None
    reason: str = Field(default='', max_length=2000)
    checklist: list[str] = Field(default_factory=list, max_length=100)
    documents: list[str] = Field(default_factory=list, max_length=100)
class Review(Input):
    approve: bool
    reason: str = Field(default='', max_length=2000)
class ReceiptReview(Review):
    notes: str = Field(default="", max_length=2000)
class Receipt(Input):
    amount: int = Field(gt=0, le=100000000000, strict=True)  # paise, never binary currency arithmetic
    milestone: Literal['production', 'dispatch']
    reference: str = Field(min_length=1, max_length=160)
    date: Date | None = None
    destination: Literal['bank', 'management'] | None = None
    mode: Literal['Bank transfer', 'UPI', 'Cheque', 'Cash', 'Card', 'Other'] | None = None
class DrawingVersion(Input):
    cad: str = Field(min_length=1, max_length=80)
    pdf: str = Field(min_length=1, max_length=80)
    note: str = Field(default='', max_length=2000)
class KeyDates(Input):
    # Captured by Sales first, then confirmed by the designer (meeting B 5:45-6:28).
    rafterInstallation: Date | None = None
    consoleInstallation: Date | None = None
    inauguration: Date | None = None
    requiredDispatch: Date | None = None
class Handover(Input):
    withoutPdi: bool = False
class FactoryAction(Input):
    action: Literal['accept', 'issue', 'start', 'complete', 'qc_pass', 'qc_fail', 'packed']
    reason: str = Field(default='', max_length=2000)
    remedy: Literal['repair', 'reproduce'] | None = None

def now(): return datetime.now(timezone.utc).isoformat()
def record(order, user, text):
    order.setdefault('history', []).append({'at': now(), 'by': user['id'], 'text': text})
def remaining(order, milestone):
    due = order.get('dues', {}).get(milestone)
    if due is None: return None
    paid = sum(r['amount'] for r in order.get('receipts', []) if r['milestone'] == milestone and r['status'] == 'confirmed')
    return max(0, due - paid)

INDIAN_STATES = {s.casefold() for s in (
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
    'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
    'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry')}
RESCHEDULE_FLAG = 3  # two reschedules are normal; the third is flagged, never blocked (meeting A 13:02-13:10, 25:38-25:43)

def handoff_gaps(order):
    """Fields Sales must hand over before post-design can run cleanly (meeting C 0:00-1:53)."""
    gaps = [label for key, label in (('shippingAddress', 'Shipping address'), ('city', 'City'), ('state', 'State'), ('phone', 'Client phone'))
            if not str(order.get(key) or '').strip()]
    state_name, country = str(order.get('state') or '').strip(), str(order.get('country') or 'India').strip()
    if state_name and country.casefold() == 'india' and state_name.casefold() not in INDIAN_STATES:
        gaps.append(f'State "{state_name}" is not an Indian state; correct it or set the country')
    return gaps

def journey(order):
    """One plain label per order, using the whiteboard stage names. Logical stages stay on the server."""
    stage, visits = order.get('stage'), order.get('visits', [])
    if stage == 'assignment': return 'Designer to be assigned'
    if stage == 'measurement':
        open_visit = next((v for v in visits if v['kind'] == 'measurement' and v['status'] not in ('rejected', 'approved')), None)
        if not open_visit: return 'Measurement to be assigned'
        return 'Measurement awaiting review' if open_visit['status'] == 'submitted' else 'Measurement in progress'
    if stage == 'drawings':
        drawings = order.get('drawings', [])
        if not order.get('clientApproved'):
            if not order.get('designStartedAt'): return 'Measurement done'
            last = drawings[-1] if drawings else None
            if last and last['status'] == 'awaiting_head': return f"V{last['version']} awaiting Design Head"
            if last and last['status'] == 'ready': return f"V{last['version']} awaiting client approval"
            return 'Design in progress'
        if remaining(order, 'production') != 0:
            requested = any(r['milestone'] == 'production' and r['status'] == 'requested' for r in order.get('receipts', []))
            return 'Production payment verification' if requested else 'Production payment pending'
        return 'Ready for factory handover'
    if stage == 'handover': return 'Factory planning' if order.get('factoryAccepted') else 'Handover to factory'
    if stage in ('production', 'qc', 'repair', 'reproduce'):
        return {'production': 'Production started', 'qc': 'QC', 'repair': 'Repair, then QC again', 'reproduce': 'Reproduction, then QC again'}[stage]
    if stage == 'packing':
        if not order.get('packedAt'): return 'Ready for packing'
        if remaining(order, 'dispatch') != 0:
            requested = any(r['milestone'] == 'dispatch' and r['status'] == 'requested' for r in order.get('receipts', []))
            return 'Dispatch payment verification' if requested else 'Dispatch payment pending'
        return 'Ready to dispatch'
    return 'Cleared for dispatch' if stage == 'cleared' else str(stage)

def cash_summary(order):
    # Safe totals for every department; raw references and receipt notes stay with Design/Accounts.
    receipts = order.get('receipts', [])
    confirmed = [r for r in receipts if r['status'] == 'confirmed']
    result = {'received': sum(r['amount'] for r in confirmed),
              'pending': sum(r['amount'] for r in receipts if r['status'] == 'requested'),
              'bank': sum(r['amount'] for r in confirmed if r.get('destination') == 'bank'),
              'management': sum(r['amount'] for r in confirmed if r.get('destination') == 'management'),
              'unclassified': sum(r['amount'] for r in confirmed if r.get('destination') not in ('bank', 'management'))}
    for milestone in ('production', 'dispatch'):
        result[milestone] = {'due': order.get('dues', {}).get(milestone),
            'received': sum(r['amount'] for r in confirmed if r['milestone'] == milestone),
            'pending': sum(r['amount'] for r in receipts if r['milestone'] == milestone and r['status'] == 'requested'),
            'balance': remaining(order, milestone)}
    return result

def register(app, engine, who, settings=None):
    def read(db):
        row = db.execute(select(state).where(state.c.id == 1)).mappings().first()
        if not row: raise HTTPException(503, 'Configure an isolated Sunroof database first.')
        payload = deepcopy(row['payload'])
        data = payload.setdefault('sunroof', {})
        for key in ('orders', 'designers', 'workers', 'members'): data.setdefault(key, [])
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

    def project(data, revision, user, request):
        requested = request.query_params.get('department', 'design')
        dept = requested if user['department'] in ('admin', 'observer') else user['department']
        if dept not in DEPARTMENTS: dept = 'design'
        orders = [deepcopy(o) for o in data['orders'] if scoped(o, user)]
        if dept == 'measurement': orders = [o for o in orders if o.get('visits')]
        if dept == 'factory': orders = [o for o in orders if o.get('stage') in FACTORY_STAGES]
        # Factory gets totals only; Measurement gets no money at all (meeting A 19:29-19:52).
        for o in orders:
            o['journey'] = journey(o)
            o['gaps'] = handoff_gaps(o)
            for v in o.get('visits', []): v['flagged'] = v.get('reschedules', 0) >= RESCHEDULE_FLAG
            if dept != 'measurement':
                o['cashFlow'] = cash_summary(o)
                o['balances'] = {s: remaining(o, s) for s in ('production', 'dispatch')}
            if dept in ('measurement', 'factory'):
                o.pop('receipts', None); o.pop('dues', None)
                o['history'] = [h for h in o.get('history', []) if not h['text'].startswith('Payment')]
            if user['department'] == 'measurement':
                o['visits'] = [v for v in o.get('visits', []) if v['workerId'] == user['staffId']]
        availability = [{'workerId': v['workerId'], 'start': v['start'], 'end': v['end']} for o in data['orders'] for v in o.get('visits', []) if v['status'] not in ('rejected', 'approved')]
        return {'orders': orders, 'designers': data['designers'], 'workers': data['workers'], 'availability': availability,
                'revision': revision, 'writable': user['role'] != 'reader', 'department': dept,
                'access': user['department'], 'staffId': user['staffId'], 'demo': data.get('demo', False), 'directory': data.get('directory'),
                'departments': list(DEPARTMENTS) if user['department'] in ('admin', 'observer') else [user['department']]}

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
            operation(data, user, order, db)
            db.execute(update(state).where(state.c.id == 1).values(payload=payload))
            event(db, user['id'], 'sunroof.department.update', order_id)
            return project(data, revision + 1, user, request)

    @app.get('/api/sunroof/workspace')
    def workspace(request: Request):
        with engine.connect() as db:
            rev, _, data = read(db); user = identity(db, request, data)
            return project(data, rev, user, request)

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

    @app.post('/api/sunroof/members')
    def member(body: Membership, request: Request):
        def op(data, user, order, db):
            if not db.execute(select(users.c.id).where(users.c.id == body.userId, users.c.active == 1)).first(): raise HTTPException(422, 'Create the user account first.')
            if body.department in ('design', 'measurement'):
                roster = data['designers'] if body.department == 'design' else data['workers']
                if not any(p['id'] == body.staffId for p in roster): raise HTTPException(422, 'Choose a valid staff record.')
            data['members'] = [m for m in data['members'] if m['userId'] != body.userId] + [body.model_dump(exclude={'revision'})]
        return change(request, body.revision, [], op)

    @app.post('/api/sunroof/orders/{order_id}/assignment')
    def assign(order_id: str, body: Assignment, request: Request):
        def op(data, user, order, db):
            designer = next((d for d in data['designers'] if d['id'] == body.designerId), None)
            if not designer: raise HTTPException(422, 'Choose a designer from the team.')
            order['designerId'] = designer['id']
            if order['stage'] == 'assignment': order['stage'] = 'measurement'
            record(order, user, 'Designer assigned: ' + designer['name'])
        return change(request, body.revision, ['design-head'], op, order_id)

    def slot(data, worker_id, start, end, skip=None):
        if start >= end or start < datetime.now(timezone.utc): raise HTTPException(422, 'Choose a future visit with an end time after its start.')
        if (end-start).total_seconds() > 86400: raise HTTPException(422, 'A visit must fit within 24 hours.')
        for order in data['orders']:
            for visit in order.get('visits', []):
                if visit['id'] != skip and visit['workerId'] == worker_id and visit['status'] not in ('rejected', 'approved') and start < datetime.fromisoformat(visit['end']) and end > datetime.fromisoformat(visit['start']):
                    raise HTTPException(409, 'That person is already booked during this time. Choose another slot.')

    @app.post('/api/sunroof/orders/{order_id}/visits')
    def book(order_id: str, body: Booking, request: Request):
        def op(data, user, order, db):
            if body.kind == 'measurement' and order['stage'] != 'measurement': raise HTTPException(422, 'This order is not awaiting measurement.')
            if body.kind == 'pdi' and not order.get('clientApproved'): raise HTTPException(422, 'Client-approved drawings are required before PDI.')
            if any(v['kind'] == body.kind and v['status'] not in ('rejected', 'approved') for v in order.get('visits', [])): raise HTTPException(422, 'This order already has an open visit.')
            worker = next((w for w in data['workers'] if w['id'] == body.workerId), None)
            if not worker: raise HTTPException(422, 'Choose a measurement team member.')
            slot(data, body.workerId, body.start, body.end)
            order.setdefault('visits', []).append({'id': str(uuid4()), 'kind': body.kind, 'workerId': body.workerId,
                'start': body.start.isoformat(), 'end': body.end.isoformat(), 'status': 'confirmed' if worker['kind'] == 'executive' else 'pending', 'checklist': [], 'documents': []})
            record(order, user, ('PDI' if body.kind == 'pdi' else 'Measurement') + ' booked with ' + worker['name'])
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/visits/{visit_id}')
    def visit_action(order_id: str, visit_id: str, body: VisitAction, request: Request):
        def op(data, user, order, db):
            visit = next((v for v in order.get('visits', []) if v['id'] == visit_id), None)
            if not visit or (user['department'] == 'measurement' and visit['workerId'] != user['staffId']): raise HTTPException(404, 'Visit not found.')
            worker = next(w for w in data['workers'] if w['id'] == visit['workerId'])
            if body.action != 'submit':
                if worker['kind'] != 'installation_manager': raise HTTPException(422, 'Measurement Executive bookings are confirmed directly and cannot be changed by the executive.')
                if visit['status'] not in ('pending', 'confirmed'): raise HTTPException(422, 'This visit cannot be rescheduled or declined now.')
                if body.action in ('reject', 'reschedule') and not body.reason.strip(): raise HTTPException(422, 'A reason is required.')
                if body.action == 'reject': visit.update(status='rejected', reason=body.reason)
                else:
                    start, end = body.start or datetime.fromisoformat(visit['start']), body.end or datetime.fromisoformat(visit['end'])
                    slot(data, visit['workerId'], start, end, visit_id)
                    moved = body.action == 'reschedule' and (start.isoformat(), end.isoformat()) != (visit['start'], visit['end'])
                    if moved: visit['reschedules'] = visit.get('reschedules', 0) + 1
                    visit.update(status='confirmed', start=start.isoformat(), end=end.isoformat(), reason=body.reason)
                    if moved and visit['reschedules'] >= RESCHEDULE_FLAG:
                        record(order, user, f"Flag: visit rescheduled {visit['reschedules']} times")
            else:
                if visit['status'] not in ('confirmed', 'corrections'): raise HTTPException(422, 'Confirm the visit before submitting results.')
                if not body.checklist or any(not x.strip() for x in body.checklist): raise HTTPException(422, 'Complete the measurement checklist.')
                docs = [d for d in order.get('documents', []) if d['id'] in body.documents and d.get('visitId') == visit_id]
                if not any(d['kind'] == 'drawing' for d in docs) or not any(d['kind'] == 'photo' for d in docs): raise HTTPException(422, 'Upload measurement drawings and site photos before submitting.')
                visit.update(status='submitted', checklist=body.checklist, documents=body.documents)
            record(order, user, 'Visit ' + body.action + (' · ' + body.reason if body.reason else ''))
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
            record(order, user, 'Designer approved visit' if body.approve else 'Designer requested corrections: ' + body.reason)
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/receipts')
    def submit_receipt(order_id: str, body: Receipt, request: Request):
        def op(data, user, order, db):
            if any(r['reference'].casefold() == body.reference.casefold() for r in order.get('receipts', []) if r['status'] != 'rejected'): raise HTTPException(422, 'This payment reference is already recorded.')
            order.setdefault('receipts', []).append({**body.model_dump(mode='json', exclude={'revision'}), 'id': str(uuid4()), 'status': 'requested', 'submittedAt': now()})
            record(order, user, 'Payment submitted to Accounts for verification')
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/receipts/{receipt_id}/review')
    def review_receipt(order_id: str, receipt_id: str, body: ReceiptReview, request: Request):
        def op(data, user, order, db):
            receipt = next((r for r in order.get('receipts', []) if r['id'] == receipt_id), None)
            if not receipt or receipt['status'] != 'requested': raise HTTPException(422, 'Payment is not awaiting verification.')
            if not body.approve and not body.reason: raise HTTPException(422, 'A rejection reason is mandatory.')
            receipt.update(status='confirmed' if body.approve else 'rejected', reason=body.reason, notes=body.notes, reviewedAt=now(), reviewedBy=user['id'])
            record(order, user, 'Payment confirmed by Accounts' if body.approve else 'Payment rejected by Accounts: ' + body.reason)
        return change(request, body.revision, ['accounts'], op, order_id)

    def design_stage(order):
        if order['stage'] != 'drawings': raise HTTPException(422, 'This order is not in design. Approve the measurement first.')

    @app.post('/api/sunroof/orders/{order_id}/design-start')
    def design_start(order_id: str, body: Input, request: Request):
        # Kept apart from "measurement done" so client holds and design time stay visible (meeting B 9:23-9:43).
        def op(data, user, order, db):
            design_stage(order)
            if order.get('designStartedAt'): raise HTTPException(422, 'Design has already started.')
            order['designStartedAt'] = now(); record(order, user, 'Design started')
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

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
            record(order, user, f'Drawing V{version} submitted' + (' · needs Design Head approval' if version >= 4 else ''))
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

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

    @app.post('/api/sunroof/orders/{order_id}/drawings/{version}/client')
    def client_decision(order_id: str, version: int, body: Review, request: Request):
        # Designer records the client's answer after sharing the link by mail or WhatsApp (meeting B 2:30-3:10).
        def op(data, user, order, db):
            drawing = current_drawing(order, version, 'ready')
            if not body.approve and not body.reason: raise HTTPException(422, "Record the client's reason for rejecting.")
            drawing.update(status='approved' if body.approve else 'rejected', clientReason=body.reason, decidedAt=now(), decidedBy=user['id'])
            if body.approve: order['clientApproved'] = True
            record(order, user, f'Client approved V{version}' if body.approve else f'Client rejected V{version}: {body.reason}')
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/dates')
    def key_dates(order_id: str, body: KeyDates, request: Request):
        def op(data, user, order, db):
            dates = order.setdefault('dates', {})
            new = body.model_dump(mode='json', exclude={'revision'})
            changed = [k for k, v in new.items() if dates.get(k) != v]
            if not changed: raise HTTPException(422, 'No date changed.')
            dates.update(new)
            record(order, user, 'Dates updated: ' + ', '.join(f"{k} {new[k] or 'cleared'}" for k in changed))
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

    @app.post('/api/sunroof/orders/{order_id}/handover')
    def send_to_factory(order_id: str, body: Handover, request: Request):
        def op(data, user, order, db):
            design_stage(order)
            if not order.get('clientApproved'): raise HTTPException(422, 'The client must approve a drawing version first.')
            balance = remaining(order, 'production')
            if balance is None: raise HTTPException(422, 'The production amount due is not recorded yet. Ask Accounts.')
            if balance > 0: raise HTTPException(422, 'Production payment is not fully confirmed by Accounts yet.')
            if not order.get('dates', {}).get('requiredDispatch'): raise HTTPException(422, 'Enter the date the client needs dispatch, so the factory can plan.')
            if not str(order.get('shippingAddress') or '').strip(): raise HTTPException(422, 'Shipping address is missing. Ask Sales to fill it.')
            pdi = [v for v in order.get('visits', []) if v['kind'] == 'pdi' and v['status'] != 'rejected']
            if any(v['status'] != 'approved' for v in pdi): raise HTTPException(422, 'A PDI is booked. Approve it before sending to the factory.')
            if not pdi and not body.withoutPdi: raise HTTPException(422, 'No PDI is booked. Book one, or confirm sending without PDI.')
            order.update(stage='handover', handedOverAt=now())
            record(order, user, 'Sent to factory' + (' without PDI' if not pdi else '') + f" · dispatch needed by {order['dates']['requiredDispatch']}")
        return change(request, body.revision, ['design', 'design-head'], op, order_id)

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
                if order['stage'] != 'production': raise HTTPException(422, 'Production has not started.')
                order.update(stage='qc', productionCompletedAt=now())
            elif action in ('qc_pass', 'qc_fail'):
                if order['stage'] != 'qc': raise HTTPException(422, 'This order is not awaiting QC.')
                if action == 'qc_fail':
                    if not body.reason or not body.remedy: raise HTTPException(422, 'Choose repair or reproduce and provide a reason.')
                    order.update(stage=body.remedy)
                else: order.update(stage='packing', qcPassedAt=now())
                order.setdefault('qc', []).append({'at': now(), 'passed': action == 'qc_pass', 'reason': body.reason, 'remedy': body.remedy})
            elif action == 'packed':
                if order['stage'] != 'packing' or not order.get('qcPassedAt'): raise HTTPException(422, 'QC must pass before packing.')
                order['packedAt'] = now()
            record(order, user, 'Factory: ' + action.replace('_', ' ') + (' · ' + body.reason if body.reason else ''))
        return change(request, body.revision, ['factory'], op, order_id)

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
                target = next((v for v in order.get('visits', []) if v['id'] == visitId and v['status'] in ('confirmed', 'corrections')), None)
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
