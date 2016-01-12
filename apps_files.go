package get3w

import "fmt"

// FileDeleteOutput specifies response of the UsersService.Login method.
type FileDeleteOutput struct {
	LastModified string `json:"last_modified,omitempty"`
}

// DeleteFile delete file
func (s *AppsService) DeleteFile(appPath, path string) (*FileDeleteOutput, *Response, error) {
	u := fmt.Sprintf("/apps/%s/files/%s", appPath, path)
	req, err := s.client.NewRequest("DELETE", u, nil)
	if err != nil {
		return nil, nil, err
	}

	output := new(FileDeleteOutput)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// FileEditInput specifies account and password to the UsersService.Login method.
type FileEditInput struct {
	//Content contains file content, Base64 encoded.
	Content string `json:"content,omitempty"`
}

// FileEditOutput specifies response of the UsersService.Login method.
type FileEditOutput struct {
	LastModified string `json:"last_modified,omitempty"`
}

// EditFile edit file content
func (s *AppsService) EditFile(appPath, path string, input *FileEditInput) (*FileEditOutput, *Response, error) {
	u := fmt.Sprintf("/apps/%s/files/%s", appPath, path)
	req, err := s.client.NewRequest("PUT", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := new(FileEditOutput)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// FileGetOutput specifies response of the UsersService.Login method.
type FileGetOutput struct {
	Content string `json:"content,omitempty"`
}

// GetFile get file content
func (s *AppsService) GetFile(owner, name, path string) (*FileGetOutput, *Response, error) {
	u := fmt.Sprintf("/apps/%s/%s/%s", owner, name, path)
	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, nil, err
	}

	output := new(FileGetOutput)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// ListFiles lists app files and folders.
func (s *AppsService) ListFiles(owner, name, path string) ([]File, *Response, error) {
	u := fmt.Sprintf("/apps/%s/%s/files/%s", owner, name, path)
	if path == "" || path == "/" || path == "." || path == "./" {
		u = fmt.Sprintf("/apps/%s/%s/files", owner, name)
	}

	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, nil, err
	}

	files := new([]File)
	resp, err := s.client.Do(req, files)
	if err != nil {
		return nil, resp, err
	}

	return *files, resp, err
}

// FilesChecksumOutput specifies response of the AppsService.Checksum method.
type FilesChecksumOutput struct {
	Files map[string]string `json:"files,omitempty"`
}

// FilesChecksum get path and checksum map of all files
func (s *AppsService) FilesChecksum(owner, name string) (*FilesChecksumOutput, *Response, error) {
	u := "apps/" + owner + "/" + name + "/files/actions/checksum"
	req, err := s.client.NewRequest("POST", u, nil)
	if err != nil {
		return nil, nil, err
	}

	output := &FilesChecksumOutput{}
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// FilesPushInput specifies optional parameters to the AppsService.FilesPush
// method.
type FilesPushInput struct {
	Removed  []string `json:"removed,omitempty"`
	Added    []string `json:"added,omitempty"`
	Modified []string `json:"modified,omitempty"`
	// Blob The updated tar.gz file content, Base64 encoded.
	Blob string `json:"blob,omitempty"`
}

// FilesPushOutput specifies response of the AppsService.FilesPush method.
type FilesPushOutput struct {
	LastModified string `json:"last_modified,omitempty"`
}

// FilesPush app files and folders.
func (s *AppsService) FilesPush(owner, name string, input *FilesPushInput) (*FilesPushOutput, *Response, error) {
	u := "apps/" + owner + "/" + name + "/files/actions/push"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := &FilesPushOutput{}
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}
