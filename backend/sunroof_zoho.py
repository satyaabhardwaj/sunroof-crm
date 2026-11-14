"""Read-only staff lookup from Zoho CRM for Sunrooof. Never writes to Zoho.

Credentials come from SUNROOOF_ZOHO_ENV (default .local/zoho.env, git-ignored) and stay on the server.
"""
import os
import urllib.parse
from pathlib import Path
from measurement.backend.connection import Connection, configuration, endpoint
from measurement.backend.mapping import ZohoError

ROOT = Path(__file__).resolve().parents[1]
ENV = Path(os.environ.get('SUNROOOF_ZOHO_ENV') or ROOT / '.local' / 'zoho.env')
# Zoho role → Sunrooof roster. Measurement Executives have no Zoho role yet; they are added in the CRM.
ROLES = {'Designers': 'designer', 'Installation Managers': 'installation_manager'}
_connection = Connection(lambda: configuration(ENV))


def staff(connection=None):
    """Active designers and installation managers, paginated until Zoho says there are no more."""
    connection = connection or _connection
    config = connection.config()
    base = endpoint(config.get('ZOHO_API_DOMAIN', 'https://www.zohoapis.in'), 'api')
    people, page = [], 1
    while page <= 50:
        url = base + '/crm/v8/users?' + urllib.parse.urlencode({'type': 'ActiveUsers', 'per_page': 200, 'page': page})
        for attempt in range(2):
            token = connection.access_token(config)
            status, payload = connection.transport(url, headers={'Authorization': 'Zoho-oauthtoken ' + token})
            if status == 401 and attempt == 0:
                connection.expires = 0
                continue
            break
        if status == 204: break
        if status != 200 or not isinstance(payload.get('users'), list):
            raise ZohoError('Zoho could not list users. Check the users scope or retry later.')
        for u in payload['users']:
            group = ROLES.get((u.get('role') or {}).get('name', ''))
            if group and u.get('id'):
                people.append({'zohoId': str(u['id']), 'name': u.get('full_name') or u.get('first_name') or 'Unnamed',
                               'kind': group, 'location': ', '.join(x for x in (u.get('city'), u.get('state')) if x)})
        if not (payload.get('info') or {}).get('more_records'): break
        page += 1
    return people


def merge(data, people):
    """Add new Zoho staff, refresh names; keep CRM-only fields (skills, location, capacity, presence)."""
    added = 0
    rosters = {'designer': data['designers'], 'installation_manager': data['workers']}
    for p in people:
        roster = rosters[p['kind']]
        sid = 'zoho-' + p['zohoId']
        row = next((r for r in roster if r['id'] == sid), None)
        if row:
            row['name'] = p['name']
            if not row.get('location') and p['location']: row['location'] = p['location']
            continue
        row = {'id': sid, 'name': p['name'], 'location': p['location'], 'source': 'zoho'}
        row.update({'payGrade': ''} if p['kind'] == 'designer' else {'kind': 'installation_manager'})
        roster.append(row); added += 1
    return added
