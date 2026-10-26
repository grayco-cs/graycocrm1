# -*- coding: utf-8 -*-
"""State- and type-specific contract clauses wired into live proposals (patch LEGAL2) + the retainage rule."""
from .lib import *

STATES = {'TN': 'Tennessee', 'MS': 'Mississippi', 'AR': 'Arkansas'}
LIEN_CITE = {'TN': 'Tenn. Code Ann. § 66-11-101 et seq.', 'MS': 'Miss. Code Ann. § 85-7-101 et seq.', 'AR': 'Ark. Code Ann. § 18-44-101 et seq.'}
RET_RES = 5
RET_COM = 10

def dispute(state):
    name = STATES[state]
    venue = {'TN': 'Shelby County, Tennessee', 'MS': '{COUNTY}, Mississippi', 'AR': '{COUNTY}, Arkansas'}[state]
    return ("DISPUTE RESOLUTION & ATTORNEY’S FEES: Any dispute shall first be submitted to non-binding mediation. If mediation fails, it shall be resolved by binding arbitration under the American Arbitration Association rules in "
            + venue + ". This Agreement is governed by the laws of " + name + ". In any mediation, arbitration, or legal proceeding, the prevailing party shall recover all reasonable attorney’s fees, court costs, arbitration fees, and related expenses, "
            "whether GrayCo is plaintiff or defendant, including any action to enforce this contract, collect payment, or defend against claims.")

def lien(state):
    name = STATES[state]
    base = ("LIEN RIGHTS: GrayCo reserves all mechanic’s, materialman’s, and construction lien rights available under the laws of " + name + " (" + LIEN_CITE[state] + "), subject to that state’s notice and filing deadlines. ")
    if state == 'AR':
        base += ("On residential property of four units or fewer, GrayCo will deliver the Arkansas Pre-Construction Notice to Owner (Ark. Code Ann. § 18-44-115) to the Owner, by personal delivery or certified mail, before work begins. ")
    elif state == 'MS':
        base += "GrayCo will give the Owner any owner notice that Mississippi law requires. "
    else:
        base += "GrayCo will give the Owner any notice to owner that Tennessee law requires. "
    return base + "No partial payment waives GrayCo’s lien rights except a signed lien waiver limited to amounts actually paid."

def prompt(state, kind):
    name = STATES[state]
    ms = " (and, in Mississippi, no later than 60 days after final completion)" if state == 'MS' else ""
    if kind == 'commercial':
        ret = ("Retainage, if any, shall be ten percent (10%) of the amount of the work properly completed unless this Agreement states a different percentage, and shall be released promptly upon substantial completion" + ms + ". ")
    else:
        ret = ("Retainage, if any, shall not exceed five percent (5%) of the work properly completed and shall be released promptly upon substantial completion" + ms + ". ")
    return ("PROMPT PAYMENT, RETAINAGE & SUSPENSION: This Agreement is governed by the prompt-payment statute of " + name + ". If payment is not made when due, GrayCo may demand, within ten (10) days, reasonable evidence that financial arrangements have been made to pay; "
            "if not provided, GrayCo may suspend or stop work without penalty. " + ret + "Retainage is earned money held temporarily, not a discount, and remains fully owed.")

TAX = {
 'MS': "Mississippi Contractor’s Tax: For non-residential contracts over $10,000, a 3.5% Mississippi contractor’s tax (Miss. Code Title 27, Ch. 65) applies to the total contract price and is included above; GrayCo remits it as prime contractor. Residential or sub-$10,000 work is subject instead to Mississippi sales/use tax on materials, included in the price.",
 'AR': "Arkansas Sales/Use Tax: In Arkansas, GrayCo is the consumer of materials and pays Arkansas sales/use tax on materials that become part of the real estate (Ark. Code § 26-52-307). That tax is already included in the contract price; no separate contractor’s tax is added to the Owner.",
}

# (county table: city / place name -> county, for the cities GrayCo works in; used when the address has no county)
COUNTY = {
 'TN': {'memphis': 'Shelby', 'bartlett': 'Shelby', 'germantown': 'Shelby', 'collierville': 'Shelby', 'cordova': 'Shelby', 'arlington': 'Shelby', 'lakeland': 'Shelby', 'millington': 'Shelby',
        'oakland': 'Fayette', 'somerville': 'Fayette', 'munford': 'Tipton', 'covington': 'Tipton', 'atoka': 'Tipton', 'brighton': 'Tipton'},
 'MS': {'southaven': 'DeSoto', 'olive branch': 'DeSoto', 'horn lake': 'DeSoto', 'hernando': 'DeSoto', 'walls': 'DeSoto', 'nesbit': 'DeSoto', 'lake cormorant': 'DeSoto', 'byhalia': 'Marshall', 'holly springs': 'Marshall',
        'senatobia': 'Tate', 'coldwater': 'Tate', 'tunica': 'Tunica', 'robinsonville': 'Tunica', 'oxford': 'Lafayette', 'batesville': 'Panola', 'tupelo': 'Lee', 'corinth': 'Alcorn', 'jackson': 'Hinds', 'gulfport': 'Harrison', 'biloxi': 'Harrison'},
 'AR': {'west memphis': 'Crittenden', 'marion': 'Crittenden', 'earle': 'Crittenden', 'jonesboro': 'Craighead', 'little rock': 'Pulaski', 'north little rock': 'Pulaski', 'blytheville': 'Mississippi', 'osceola': 'Mississippi', 'forrest city': 'St. Francis'},
}

RETAINAGE_FLAG = ("Retainage: customer contracts and pay apps now agree. Residential = 5% cap (Residential Renovation contract, residential pay apps); Commercial = 10% unless the contract says otherwise (Commercial contract text, pay-app default). "
                  "The old text said 5% was 'the maximum allowed in Tennessee, Mississippi and Arkansas'; we removed that statement because we could not verify it. Counsel: Tennessee's Prompt Pay Act (Tenn. Code Ann. § 66-34-103 — verify) may cap retainage at 5% on private contracts, which would conflict with the 10% commercial default; Mississippi release timing (60 days after final completion) and the Arkansas rules should also be checked.")
