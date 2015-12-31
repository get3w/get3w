package get3w

// AppsService handles communication with the file related
// methods of the Get3W API.
type AppsService struct {
	client *Client
}

// AppCreateInput specifies fields to the AppsService.Create method.
type AppCreateInput struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	Tags        string `json:"tags,omitempty"`
	Origin      string `json:"origin,omitempty"`
	Private     bool   `json:"private,omitempty"`
}

// Create a new app
func (s *AppsService) Create(input *AppCreateInput) (*App, *Response, error) {
	u := "apps"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	var app = &App{}
	resp, err := s.client.Do(req, app)
	if err != nil {
		return nil, resp, err
	}

	return app, resp, err
}

// Delete app
func (s *AppsService) Delete(appPath string) (*App, *Response, error) {
	u := "apps/" + appPath
	req, err := s.client.NewRequest("DELETE", u, nil)
	if err != nil {
		return nil, nil, err
	}

	var app = &App{}
	resp, err := s.client.Do(req, app)
	if err != nil {
		return nil, resp, err
	}

	return app, resp, err
}

// Edit app
func (s *AppsService) Edit(appPath string, input map[string]interface{}) (*App, *Response, error) {
	u := "apps/" + appPath
	req, err := s.client.NewRequest("PATCH", u, input)
	if err != nil {
		return nil, nil, err
	}

	var app = &App{}
	resp, err := s.client.Do(req, app)
	if err != nil {
		return nil, resp, err
	}

	return app, resp, err
}

// Get app
func (s *AppsService) Get(appPath string) (*App, *Response, error) {
	u := "apps/" + appPath
	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, nil, err
	}

	var app = &App{}
	resp, err := s.client.Do(req, app)
	if err != nil {
		return nil, resp, err
	}

	return app, resp, err
}

// List app
func (s *AppsService) List() (*[]App, *Response, error) {
	u := "apps"
	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, nil, err
	}

	var apps = &[]App{}
	resp, err := s.client.Do(req, apps)
	if err != nil {
		return nil, resp, err
	}

	return apps, resp, err
}

// Open a new app
func (s *AppsService) Open(appPath string) ([]*App, *Response, error) {
	u := "apps/" + appPath + "/actions/open"
	req, err := s.client.NewRequest("POST", u, nil)
	if err != nil {
		return nil, nil, err
	}

	var apps = []*App{}
	resp, err := s.client.Do(req, apps)
	if err != nil {
		return nil, resp, err
	}

	return apps, resp, err
}

// AppLoadInput specifies optional parameters to the AppsService.Load
// method.
type AppLoadInput struct {
	LastModified string `json:"last_modified,omitempty"`
}

// AppLoadOutput specifies response of the AppsService.Load method.
type AppLoadOutput struct {
	LastModified string  `json:"last_modified,omitempty"`
	App          *App    `json:"app,omitempty"`
	Config       *Config `json:"config,omitempty"`
	Sites        []*Site `json:"sites,omitempty"`
}

// Load app data
func (s *AppsService) Load(appPath string, input *AppLoadInput) (*AppLoadOutput, *Response, error) {
	u := "apps/" + appPath + "/actions/load"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := &AppLoadOutput{}
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// Publish app
func (s *AppsService) Publish(appPath string) (*Response, error) {
	u := "apps/" + appPath + "/actions/publish"
	req, err := s.client.NewRequest("POST", u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req, nil)
	if err != nil {
		return resp, err
	}

	return resp, err
}

// AppSaveInput specifies optional parameters to the AppsService.Save
// method.
type AppSaveInput struct {
	Payloads []*SavePayload `json:"payloads,omitempty"`
}

// AppSaveOutput specifies response of the AppsService.Save method.
type AppSaveOutput struct {
	LastModified string `json:"last_modified,omitempty"`
}

// Save app data
func (s *AppsService) Save(appPath string, input *AppSaveInput) (*AppSaveOutput, *Response, error) {
	u := "apps/" + appPath + "/actions/save"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := &AppSaveOutput{}
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// AppStarInput specifies optional parameters to the AppsService.Star
// method.
type AppStarInput struct {
	Star bool `json:"star,omitempty"`
}

// AppStarOutput specifies response of the AppsService.Star method.
type AppStarOutput struct {
	StarCount int64 `json:"star,omitempty"`
}

// Star app data
func (s *AppsService) Star(appPath string, input *AppStarInput) (*AppStarOutput, *Response, error) {
	u := "apps/" + appPath + "/actions/star"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := &AppStarOutput{}
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}
