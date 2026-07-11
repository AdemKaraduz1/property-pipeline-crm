import { PropertySummaryActions } from "@/components/PropertySummaryActions";

const SUMMARY = `Property Pipeline CRM Deal Summary
123 Test St
Chicago, IL 60622
MLS: 12345
Status: active
Property type: 3-flat

Current View
Asking price: $450,000
Current annual rent: $54,000
Current NOI: $30,000
Current cap rate: 6.67%

Projected View
Analyzed purchase price: $430,000
Projected annual rent: $60,000
Projected NOI: $34,000
Projected cap rate: 7.91%
Annual debt service: $22,000
Total rehab: $25,000

Return Summary
Monthly cash flow: $700
Cash-on-cash return: 9.20%
DSCR: 1.55x
Total estimated cash required: $110,000
Financing assumption: 20% down, 7.25%, 30 years

NOI Bridge
Gross rent: $60,000
Vacancy: $4,200
Additional income: $1,800
Operating expenses: $23,600
NOI: $34,000

Investment Position
Asking price: $450,000
Analyzed purchase price: $430,000
Starting offer price: $378,000
Maximum purchase price: $402,000
Primary risk: Achievement of projected rents and verification of legal unit count

Property Details
Neighborhood: Logan Square
Year built: 1920
Total sqft: 4200
Lot size: 3125
Units: 3
Price per unit: $150,000
Down payment: $86,000
Loan amount: $344,000
Taxes annual: $8,500
Insurance annual: $2,500
Parking: 2 spaces

Common Area Rehab
Contingency: 10%
Common area rehab total: $0

Additional Income

Key Diligence Before Offer
- Confirm the garden unit is a legal fourth dwelling unit and obtain applicable permits.

Units
- Unit 1: 2 bed / 1 bath, current $1,500, projected $1,700, rehab $5,000

Planning note: Deal outputs are estimates for acquisition planning. Confirm taxes, financing, rents, insurance, code issues, and rehab costs before making offers.`;

export default function DevVerifyScratchPage() {
  return (
    <div style={{ padding: 24 }}>
      <PropertySummaryActions
        propertyId="test-a"
        fileName="test-property-a"
        summary={SUMMARY}
      />
    </div>
  );
}
