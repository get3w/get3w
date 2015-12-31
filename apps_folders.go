package get3w

import "fmt"

// FolderCreateInput specifies account and password to the UsersService.Login method.
type FolderCreateInput struct {
	Path string `json:"path,omitempty"`
}

// FolderCreateOutput specifies response of the UsersService.Login method.
type FolderCreateOutput struct {
	LastModified string `json:"last_modified,omitempty"`
}

// CreateFolder create Folder
func (s *AppsService) CreateFolder(appPath string, input *FolderCreateInput) (*FolderCreateOutput, *Response, error) {
	u := fmt.Sprintf("/apps/%v/folders", appPath)
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := new(FolderCreateOutput)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// FolderDeleteInput specifies account and password to the UsersService.Login method.
type FolderDeleteInput struct {
	Path string `json:"path,omitempty"`
}

// FolderDeleteOutput specifies response of the UsersService.Login method.
type FolderDeleteOutput struct {
	LastModified string `json:"last_modified,omitempty"`
}

// DeleteFolder delete Folder
func (s *AppsService) DeleteFolder(appPath string, input *FolderDeleteInput) (*FolderDeleteOutput, *Response, error) {
	u := fmt.Sprintf("/apps/%v/folders", appPath)
	req, err := s.client.NewRequest("DELETE", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := new(FolderDeleteOutput)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}
