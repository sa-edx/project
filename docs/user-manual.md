# User Manual

## 1. Purpose

This portal is a real-estate showcase and management system. It has two main areas:

- Public area for browsing projects, buildings, floor plans, amenities, points of interest, and lead actions.
- Admin area for managing developers, projects, buildings, floors, units, facilities, amenities, and lead records.

## 2. Main User Roles

- Public visitor: views projects and project media.
- Admin / system administrator: creates and manages inventory and records.
- Developer: manages projects and related structure assigned to their account.

## 3. Public Workflow

### 3.1 Home page

- Open the portal in the browser.
- Browse the rotating project video/image showcase.
- Use the search, builder, project, and building controls to narrow results.
- Click a project card or showcase item to open the map view for that project.

### 3.2 Map page

- View the selected project centered on the map.
- Use the side panel to:
  - Open `Floors/Gallery`
  - Expand `Amenities`
  - Expand `Points of Interest`
- Select facilities or amenities to show them on the map.
- View route details when points of interest are selected.

### 3.3 Project detail page

- Opened from the `Floors/Gallery` button.
- Select a floor, then a unit, then a gallery view.
- View floor plans, unit layout plans, gallery images, and 3D model previews when available.
- Use the contact / enquiry / booking actions shown on the detail page.

## 4. Admin Workflow

### 4.1 Sign in

- Open the admin view.
- Sign in using the seeded administrator account.
- After login, the admin dashboard shows developer, project, facility, amenity, and structure tools.

### 4.2 Developer management

- Create new developers.
- Delete developers from the sidebar delete control.
- Assign a user owner if needed through the developer record.

### 4.3 User management

- Create new portal users from the admin sidebar.
- Choose the user role while creating the account.
- Reset an existing user password from the password reset panel.

### 4.4 Project management

- Create a project from the admin sidebar.
- Edit the selected project in the project editor.
- Upload:
  - Main image / cover image
  - Gallery images
  - 3D model file
- Delete the selected project from the project editor.

### 4.5 Building, floor, and unit management

- Create buildings under the selected project.
- Create floors under the selected building.
- Create units under the selected floor.
- For floors:
  - Add a floor plan image
- For units:
  - Add layout plan image
  - Add gallery media
  - Add amenities
- Delete building, floor, or unit from the structure manager.

### 4.6 Facilities and amenities

- Create facilities and amenities from the dedicated managers.
- Assign them to projects.
- For facilities, save coordinates and distance metadata.
- For amenities, save image and category information.

### 4.7 Leads, visits, and bookings

- Leads are created from public enquiry flows.
- Admin users can review and update lead status, priority, and assignment.
- Site visits and bookings are stored against the lead/project/unit records.

## 5. Common Troubleshooting

- If login fails, verify the API is running and the token is being stored in the browser.
- If projects do not load, verify the API base URL and database connection.
- If images do not display, confirm the uploaded file URLs are saved in the project or unit record.
- If the map is blank, confirm the MapStore instance is available and the frontend environment variables are set correctly.
