"""Sunrooof workflow rules with no web or database code, so each rule can be tested on its own.

Stage names and owners follow the 13 Nov 2026 whiteboard and the owner's walkthrough of 14 Nov 2026.
"""
from datetime import datetime, date as Date, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

# ---------------------------------------------------------------- stages

# (key, label, owner). Owner says whose move it is; the designer sees every stage.
STAGES = (
    ('designer_to_assign', 'Designer to be assigned', 'design-head'),
    ('measurement_to_assign', 'Measurement to be assigned', 'design'),
    ('measurement_in_progress', 'Measurement in progress', 'measurement'),
    ('measurement_done', 'Measurement done', 'design'),
    ('design_in_progress', 'Design in progress', 'design'),
    ('approval_pending', 'Approval pending', 'design'),
    ('approved', 'Approved', 'design'),
    ('production_payment_pending', 'Production payment pending', 'design'),
    ('production_payment_verification', 'Production payment verification', 'accounts'),
    ('handover_to_factory', 'Handover to factory', 'design'),
    ('production_pending', 'Production pending', 'factory'),
    ('production_started', 'Production started', 'factory'),
    ('qc', 'QC', 'factory'),
    ('ready_packed', 'Ready & packed', 'factory'),
    ('rafter_payment_pending', 'Rafter dispatch payment', 'design'),
    ('rafter_payment_verification', 'Rafter payment verification', 'accounts'),
    ('request_dispatch', 'Request for dispatch', 'design'),
    ('dispatch_pending', 'Dispatch pending', 'dispatch'),
    ('ready_to_dispatch', 'Ready to dispatch', 'dispatch'),
    ('dispatched', 'Dispatched', 'dispatch'),
)
STAGE = {key: (label, owner) for key, label, owner in STAGES}
# Server-side order.stage values (the coarse record); the stage above is worked out from it.
FACTORY_STAGES = ('handover', 'production', 'qc', 'repair', 'reproduce', 'packing', 'dispatch', 'dispatched', 'cleared')
PARTS = ('rafter', 'console')  # rafters go first, consoles after (owner, 14 Nov)


def _requested(order, milestone):
    return any(r['milestone'] == milestone and r['status'] == 'requested' for r in order.get('receipts', []))


def stage_of(order):
    """The one whiteboard stage this order is in, with the detail the designer needs to see."""
    stage, visits = order.get('stage'), order.get('visits', [])
    if stage == 'assignment' or not order.get('designerId'):
        return 'designer_to_assign', ''
    if stage == 'measurement':
        open_visit = next((v for v in visits if v['kind'] == 'measurement' and v['status'] not in ('rejected', 'approved')), None)
        if not open_visit: return 'measurement_to_assign', ''
        detail = {'pending': 'waiting for the installation manager to confirm', 'confirmed': 'assigned',
                  'departed': 'on the way', 'arrived': 'reached site', 'submitted': 'done · waiting for your review',
                  'corrections': 'corrections requested'}.get(open_visit['status'], open_visit['status'])
        return 'measurement_in_progress', detail
    if stage == 'drawings':
        drawings = order.get('drawings', [])
        last = drawings[-1] if drawings else None
        if not order.get('clientApproved'):
            if last and last['status'] == 'awaiting_head': return 'approval_pending', f"V{last['version']} with the Design Head"
            if last and last['status'] == 'ready': return 'approval_pending', f"V{last['version']} with the client"
            if order.get('designStartedAt') or drawings: return 'design_in_progress', f"after V{last['version']} {last['status']}" if last else ''
            return 'measurement_done', ''
        if balance(order, 'production') != 0:
            if _requested(order, 'production'): return 'production_payment_verification', ''
            return 'production_payment_pending', '' if balance(order, 'production') is not None else 'amount due not recorded'
        return 'approved', 'ready for factory handover'
    if stage == 'handover':
        return ('production_pending', 'accepted by factory') if order.get('factoryAccepted') else ('handover_to_factory', '')
    if stage in ('production', 'repair', 'reproduce'):
        last_qc = (order.get('qc') or [None])[-1]
        return 'production_started', (f"after QC failed · {last_qc.get('remedy')}" if last_qc and not last_qc['passed'] else '')
    if stage == 'qc': return 'qc', ''
    if stage == 'packing': return 'ready_packed', 'QC passed · packing'
    if stage in ('dispatch', 'dispatched', 'cleared'):
        parts = order.get('dispatch', {})
        part = 'console' if parts.get('rafter', {}).get('status') == 'dispatched' else 'rafter'
        status = parts.get(part, {}).get('status')
        milestone = 'rafter' if part == 'rafter' else 'dispatch'
        name = 'Rafters' if part == 'rafter' else 'Consoles'
        if stage == 'dispatched' or (part == 'console' and status == 'dispatched'): return 'dispatched', 'rafters and consoles'
        if status == 'ready': return 'ready_to_dispatch', name
        if status == 'requested': return 'dispatch_pending', name
        if balance(order, milestone) == 0: return 'request_dispatch', name
        if _requested(order, milestone): return 'rafter_payment_verification', name
        return 'rafter_payment_pending', name + (' · amount due not recorded' if balance(order, milestone) is None else '')
    return 'ready_packed', ''


TASKS = {
    'designer_to_assign': 'Assign a designer', 'measurement_to_assign': 'Book the measurement visit',
    'measurement_in_progress': 'Do the measurement visit', 'measurement_done': 'Start the design',
    'design_in_progress': 'Make and submit the next drawing version', 'approval_pending': "Get the client's approval",
    'approved': 'Send the order to the factory', 'production_payment_pending': 'Collect the production payment',
    'production_payment_verification': 'Verify the production payment', 'handover_to_factory': 'Accept the handover',
    'production_pending': 'Start production', 'production_started': 'Finish production', 'qc': 'Record the QC result',
    'ready_packed': 'Pack the order', 'rafter_payment_pending': 'Collect the rafter dispatch payment',
    'rafter_payment_verification': 'Verify the dispatch payment', 'request_dispatch': 'Request dispatch',
    'dispatch_pending': 'Get it ready to dispatch', 'ready_to_dispatch': 'Dispatch',
}


def task_of(order):
    """The one open task this order creates right now: what, for whom (an inbox key) and by when. None once dispatched."""
    key, detail = stage_of(order)
    if key == 'dispatched': return None
    owner = STAGE[key][1]
    title = TASKS[key]
    open_visit = next((v for v in order.get('visits', []) if v['status'] not in ('rejected', 'approved')), None)
    due = None
    if key == 'measurement_in_progress' and open_visit:
        if open_visit['status'] == 'submitted': owner, title = 'design', 'Review the measurement'
        elif open_visit['status'] == 'pending': title = 'Confirm the measurement visit with the client'
        due = open_visit['start'][:10]
    if key == 'approval_pending' and 'Design Head' in detail: owner, title = 'design-head', 'Approve the drawing version'
    dates = order.get('dates', {})
    if key in ('handover_to_factory', 'production_pending', 'production_started', 'qc', 'ready_packed'): due = dates.get('requiredDispatch')
    if key in ('rafter_payment_pending', 'rafter_payment_verification', 'request_dispatch', 'dispatch_pending', 'ready_to_dispatch'):
        console = detail.startswith('Consoles')
        due = dates.get('consoleDispatch' if console else 'rafterDispatch')
        title = title.replace('rafter', 'console') if console else title
        if key in ('dispatch_pending', 'ready_to_dispatch', 'request_dispatch'): title += ' (consoles)' if console else ' (rafters)'
    to = {'design': 'designer:' + str(order.get('designerId') or ''), 'measurement': 'worker:' + (open_visit or {}).get('workerId', ''),
          'accounts': 'dept:accounts', 'factory': 'dept:factory', 'dispatch': 'dept:factory', 'design-head': 'dept:design-head'}[owner]
    return {'key': key, 'title': title, 'to': to, 'due': due}


def journey(order):
    key, detail = stage_of(order)
    label, owner = STAGE[key]
    if key == 'rafter_payment_pending' and detail.startswith('Consoles'): label = 'Console dispatch payment'
    if key == 'rafter_payment_verification' and detail.startswith('Consoles'): label = 'Console payment verification'
    return {'key': key, 'label': label, 'owner': owner, 'detail': detail,
            'step': [k for k, _, _ in STAGES].index(key) + 1, 'of': len(STAGES)}

# ---------------------------------------------------------------- money

# Same plans as shared/rules.js. Shares in order; the first is the booking share Sales collects.
PLANS = {
    'SM': [('Booking', 50), ('Production', 30), ('PDI', 20)],
    'AVP': [('Booking', 25), ('EPT', 25), ('Production', 30), ('PDI', 20)],
    'Founder': [('Booking', 25), ('EPT', 25), ('Production', 30), ('PDI', 15), ('EHOD', 5)],
    'Custom': [('Booking', 50), ('Production', 30), ('PDI', 20)],
}
MILESTONES = ('production', 'rafter', 'dispatch')


def targets(order):
    """Cumulative money that must be confirmed before each gate, in paise; None where unknown.

    Explicit order['dues'] (set by Accounts) are per-gate amounts and win. Otherwise the plan is used:
    production = all shares up to and including Production; rafter dispatch = the next share as well;
    console dispatch = 100%. EHOD-style shares after that are collected after handover.
    """
    dues = order.get('dues') or {}
    if any(dues.get(m) is not None for m in MILESTONES):
        total, out = 0, {}
        for m in MILESTONES:
            if dues.get(m) is None:
                out[m] = None if m == 'production' or out.get(MILESTONES[MILESTONES.index(m) - 1]) is None else total
                continue
            total += dues[m]; out[m] = total
        return out
    value, shares = order.get('value'), PLANS.get(order.get('plan') or '')
    if not value or not shares: return {m: None for m in MILESTONES}
    names = [n for n, _ in shares]
    upto = names.index('Production') if 'Production' in names else 0
    cum = lambda i: round(value * sum(p for _, p in shares[:i + 1]) / 100)
    return {'production': cum(upto), 'rafter': cum(min(upto + 1, len(shares) - 1)), 'dispatch': value}


def received(order):
    """Everything confirmed by Accounts, plus what Sales had collected before the order reached Design."""
    return (order.get('receivedBeforeDesign') or 0) + sum(r['amount'] for r in order.get('receipts', []) if r['status'] == 'confirmed')


def balance(order, milestone):
    """Accrued dues still missing at this gate. Earlier arrears stay inside the cumulative figure."""
    target = targets(order).get(milestone)
    return None if target is None else max(0, target - received(order))

# ---------------------------------------------------------------- Sales hand-over checks

INDIAN_STATES = {s.casefold() for s in (
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
    'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
    'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry')}


def handoff_gaps(order):
    gaps = [label for key, label in (('shippingAddress', 'Shipping address'), ('city', 'City'), ('state', 'State'),
                                     ('phone', 'Client phone'), ('email', 'Client email')) if not str(order.get(key) or '').strip()]
    state_name, country = str(order.get('state') or '').strip(), str(order.get('country') or 'India').strip()
    if state_name and country.casefold() == 'india' and state_name.casefold() not in INDIAN_STATES:
        gaps.append(f'State "{state_name}" is not an Indian state; correct it or set the country')
    return gaps

# ---------------------------------------------------------------- designer allocation

# The Design Head's skill matrix (Google Sheet "Sunrooof Designer Skill Matrix", 14 Nov 2026): 0-5 per skill.
SKILLS = ('geography', 'workload', 'residential', 'commercial', 'propertySize', 'normalClient', 'celebrity', 'hni')
SHEET_COLUMNS = {'Geography': 'geography', 'Workload Handling': 'workload', 'Residential': 'residential', 'Commercial': 'commercial',
                 'Property Size': 'propertySize', 'Normal Client': 'normalClient', 'Celebrity Client': 'celebrity', 'HNI Client': 'hni'}
LAKH = 100000 * 100  # paise
# Design Head (14 Nov): every designer has the same monthly revenue target for now, ₹40 lakh, editable per designer.
DEFAULT_ALLOCATION = {'monthlyTarget': 40 * LAKH, 'minimumSkill': 4, 'largeSquareFeet': None}


def traits(order, rules):
    """Which skill columns matter for this order."""
    kind = order.get('clientType') or ('celebrity' if order.get('celebrity') else 'normal')
    found = [{'celebrity': 'celebrity', 'hni': 'hni'}.get(kind, 'normalClient')]
    if str(order.get('country') or 'India').strip().casefold() != 'india': found.append('geography')
    project = str(order.get('projectType') or '').casefold()
    if project in ('residential', 'commercial'): found.append(project)
    if order.get('complex') or (rules.get('largeSquareFeet') and (order.get('squareFeet') or 0) >= rules['largeSquareFeet']):
        found.append('propertySize')
    return found


def today(): return datetime.now(IST).date().isoformat()


def available(person):
    """Punched in today. Presence lapses at midnight IST, so yesterday's punch-in never counts."""
    return person.get('presence', {}).get('date') == today() and person['presence'].get('available', False)


def near(a, b):
    a, b = str(a or '').casefold().strip(), str(b or '').casefold().strip()
    return bool(a and b and (a in b or b in a))


def active_load(orders, designer_id):
    return sum(1 for o in orders if o.get('designerId') == designer_id and o.get('stage') not in ('dispatched', 'cleared'))


def month_revenue(orders, designer_id, month=None):
    """Order value assigned to this designer in the current IST month (by assignment date)."""
    month = month or datetime.now(IST).strftime('%Y-%m')
    return sum(o.get('value') or 0 for o in orders if o.get('designerId') == designer_id
               and datetime.fromisoformat(o.get('assignedAt') or '1970-01-01T00:00:00+00:00').astimezone(IST).strftime('%Y-%m') == month)


def rank_designers(order, designers, orders, rules=None):
    """Design Head's rule (14 Nov): first the skill sheet decides who can take the order (every needed skill at least
    `minimumSkill`); among those, the one with the most room under their monthly revenue target this month gets it.
    If nobody meets the skill bar, the highest-skilled designers are used instead. Only punched-in designers count
    when anyone has punched in today."""
    rules = {**DEFAULT_ALLOCATION, **(rules or {})}
    wanted = traits(order, rules)
    pool = [d for d in designers if available(d)] or list(designers)
    ranked = []
    for d in pool:
        skills = d.get('skills') or {}
        scores = [int(skills.get(t) or 0) for t in wanted]
        load = active_load(orders, d['id'])
        if d.get('capacity') and load >= d['capacity']: continue
        target = d.get('target') or rules['monthlyTarget']
        assigned = month_revenue(orders, d['id'])
        ranked.append({'designerId': d['id'], 'name': d['name'], 'skill': sum(scores), 'lowest': min(scores) if scores else 0,
                       'eligible': bool(scores) and min(scores) >= rules['minimumSkill'], 'assigned': assigned, 'target': target,
                       'room': target - assigned, 'load': load, 'available': available(d), 'traits': wanted})
    if not any(r['eligible'] for r in ranked) and ranked:
        best = max(r['lowest'] for r in ranked)
        for r in ranked: r['eligible'] = r['lowest'] == best and best > 0
    return sorted(ranked, key=lambda r: (not r['eligible'], -r['room'] / max(r['target'], 1), r['load'], r['name']))


def parse_skill_sheet(text):
    """Rows from the skill matrix CSV: Zoho user ID → skills and notes. Blank = unrated (left out)."""
    import csv, io
    rows = list(csv.reader(io.StringIO(text)))
    head = next((i for i, r in enumerate(rows) if 'Designer Name' in r), None)
    if head is None: raise ValueError('This is not the skill matrix: no "Designer Name" column.')
    names = [c.split(' /')[0].strip() for c in rows[head]]
    out = []
    for r in rows[head + 1:]:
        cell = dict(zip(names, r))
        zoho, name = (cell.get('Zoho User ID') or '').strip(), (cell.get('Designer Name') or '').strip()
        if not name: continue
        skills = {}
        for column, key in SHEET_COLUMNS.items():
            value = (cell.get(column) or '').strip()
            if value:
                score = int(float(value))
                if not 0 <= score <= 5: raise ValueError(f'{name}: {column} must be 0 to 5.')
                skills[key] = score
        out.append({'zohoId': zoho, 'name': name, 'skills': skills, 'notes': (cell.get('Review Notes') or '').strip()})
    return out


# ---------------------------------------------------------------- measurement calendar

SLOTS = ((time(9), time(12)), (time(13), time(16)), (time(17), time(19)))  # meeting A 9:17-9:24


def slot_times(day, first, count=1):
    """Start and end of `count` consecutive slots from `first` (long trips can take more than one)."""
    if not 0 <= first < len(SLOTS) or count < 1 or first + count > len(SLOTS): raise ValueError('Choose a slot that exists.')
    start = datetime.combine(day, SLOTS[first][0], IST)
    end = datetime.combine(day, SLOTS[first + count - 1][1], IST)
    return start, end


def busy(orders, worker_id, start, end, skip=None):
    for order in orders:
        for v in order.get('visits', []):
            if v['id'] != skip and v['workerId'] == worker_id and v['status'] not in ('rejected', 'approved', 'submitted') \
                    and start < datetime.fromisoformat(v['end']) and end > datetime.fromisoformat(v['start']):
                return True
    return False


# Measurement (Design Head, 14 Nov): the in-house executives cover their own region; every other city goes to the
# Installation Managers listed in Zoho.
REGIONS = {
    'Delhi NCR': ('delhi', 'new delhi', 'gurugram', 'gurgaon', 'noida', 'greater noida', 'faridabad', 'ghaziabad'),
    'Mumbai': ('mumbai', 'navi mumbai', 'thane'),
}


def region_of(place):
    text = str(place or '').casefold()
    return next((name for name, cities in REGIONS.items() if any(c in text for c in cities)), '')


def visit_team(workers, order):
    """Who may be sent: the region's in-house executives, otherwise Installation Managers (nearest first)."""
    region = region_of((order or {}).get('city') or (order or {}).get('location'))
    inhouse = [w for w in workers if w['kind'] == 'executive' and w.get('region') == region] if region else []
    if inhouse: return inhouse
    ims = [w for w in workers if w['kind'] == 'installation_manager']
    place = (order or {}).get('city') or (order or {}).get('location')
    return sorted(ims, key=lambda w: (not near(w.get('location'), place), w['name'])) or list(workers)


def calendar(orders, workers, first_day, days, order=None):
    """Every worker's three slots per day: free, busy or past. The people who should go come first."""
    now = datetime.now(IST)
    team = {w['id'] for w in visit_team(workers, order)} if order else set()
    rows = []
    for w in workers:
        days_out = []
        for n in range(days):
            day = first_day + timedelta(days=n)
            slots = []
            for i in range(len(SLOTS)):
                start, end = slot_times(day, i)
                slots.append('past' if start <= now else 'busy' if busy(orders, w['id'], start, end) else 'free')
            days_out.append({'date': day.isoformat(), 'slots': slots})
        rows.append({'workerId': w['id'], 'name': w['name'], 'kind': w['kind'], 'location': w.get('location', ''), 'region': w.get('region', ''),
                     'suggested': w['id'] in team, 'nearby': near(w.get('location'), (order or {}).get('city') or (order or {}).get('location')),
                     'available': available(w), 'days': days_out})
    return sorted(rows, key=lambda r: (not r['suggested'], not r['nearby'], r['name']))


def suggest_visit(orders, workers, order, first_day=None, days=14):
    """Earliest free slot among the people who should go (in-house team for its region, otherwise IMs)."""
    first_day = first_day or datetime.now(IST).date()
    best = None
    for w in visit_team(workers, order):
        for n in range(days):
            day = first_day + timedelta(days=n)
            for i in range(len(SLOTS)):
                start, end = slot_times(day, i)
                if start > datetime.now(IST) and not busy(orders, w['id'], start, end):
                    if best is None or start < best[0]: best = (start, {'workerId': w['id'], 'date': day.isoformat(), 'slot': i})
                    break
            else: continue
            break
    return best[1] if best else None


def parse_day(value):
    return Date.fromisoformat(value) if isinstance(value, str) else value
