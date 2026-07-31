# ERD

This ERD is based on `apps/api/prisma/schema.prisma`.

```mermaid
erDiagram
  ROLE ||--o{ USER : has
  ROLE ||--o{ ROLE_PERMISSION : grants
  PERMISSION ||--o{ ROLE_PERMISSION : assigned

  USER ||--o| DEVELOPER : owns
  DEVELOPER ||--o{ PROJECT : manages

  PROJECT ||--o{ BUILDING : contains
  PROJECT ||--o{ FLOOR : contains
  PROJECT ||--o{ UNIT : contains
  PROJECT ||--o{ LEAD : receives
  PROJECT ||--o{ SITE_VISIT : has
  PROJECT ||--o{ BOOKING : has
  PROJECT ||--o{ NEARBY_DESTINATION : has
  PROJECT ||--o{ PROJECT_FACILITY : links
  PROJECT ||--o{ PROJECT_AMENITY : links

  BUILDING ||--o{ FLOOR : contains
  BUILDING ||--o{ UNIT : contains

  FLOOR ||--o{ UNIT : contains

  UNIT ||--o| LEAD : selected_by
  UNIT ||--o{ SITE_VISIT : visited_in
  UNIT ||--o{ BOOKING : reserved_in

  LEAD ||--o{ SITE_VISIT : schedules
  LEAD ||--o{ BOOKING : creates

  FACILITY ||--o{ PROJECT_FACILITY : assigned_to
  AMENITY ||--o{ PROJECT_AMENITY : assigned_to

  ROLE {
    string id PK
    string name
    string description
    boolean isSystemRole
  }

  PERMISSION {
    string id PK
    string module
    string action
    string description
  }

  USER {
    string id PK
    string email
    string password
    string firstName
    string lastName
    string roleId FK
  }

  DEVELOPER {
    string id PK
    string ownerUserId FK
    string companyName
    string email
    string phone
    string country
    string city
    string status
  }

  PROJECT {
    string id PK
    string developerId FK
    string projectCode
    string projectName
    string projectType
    string country
    string city
    string address
    decimal latitude
    decimal longitude
    decimal startingPrice
    json gallery
    string coverImage
    string model3dUrl
    string status
    string slug
  }

  BUILDING {
    string id PK
    string projectId FK
    string buildingCode
    string buildingName
    string buildingType
    int floorsCount
    int unitsCount
    string status
  }

  FLOOR {
    string id PK
    string projectId FK
    string buildingId FK
    int floorNumber
    string floorName
    string floorPlan
    int displayOrder
    string status
  }

  UNIT {
    string id PK
    string projectId FK
    string buildingId FK
    string floorId FK
    string unitNumber
    string unitCode
    string unitType
    int bedrooms
    int bathrooms
    decimal area
    decimal basePrice
    string currency
    string status
    boolean featured
    string viewType
    string layoutPlan
    json media
    json amenities
  }

  LEAD {
    string id PK
    string projectId FK
    string unitId FK
    string source
    string firstName
    string lastName
    string email
    string phone
    string status
    string priority
    string assignedToName
  }

  SITE_VISIT {
    string id PK
    string leadId FK
    string projectId FK
    string unitId FK
    string status
    datetime preferredVisitAt
    datetime scheduledFor
  }

  BOOKING {
    string id PK
    string leadId FK
    string projectId FK
    string unitId FK
    string bookingReference
    string status
    decimal reservationAmount
    string currency
    datetime bookedAt
  }

  NEARBY_DESTINATION {
    string id PK
    string projectId FK
    string label
    string category
    decimal latitude
    decimal longitude
    float distanceKm
    int travelMinutes
    string mode
    int sortOrder
  }

  FACILITY {
    string id PK
    string name
    string category
    decimal latitude
    decimal longitude
    string icon
    string status
  }

  PROJECT_FACILITY {
    string id PK
    string projectId FK
    string facilityId FK
    int sortOrder
    float distanceKm
    int travelMinutes
    string mode
  }

  AMENITY {
    string id PK
    string name
    string category
    string image
    string status
  }

  PROJECT_AMENITY {
    string id PK
    string projectId FK
    string amenityId FK
    int sortOrder
    string notes
  }
```

## Relationship Notes

- `Developer` owns many `Project` records.
- `Project` is the parent record for buildings, floors, units, leads, bookings, visits, nearby destinations, POIs, and amenities.
- `Building` owns floors and units within a project.
- `Floor` owns units within a building.
- `Lead` can optionally point to a unit and can spawn site visits and bookings.
- `ProjectFacility` and `ProjectAmenity` are join tables that connect master data to a specific project.

