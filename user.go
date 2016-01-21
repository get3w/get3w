package get3w

// UserService handles communication with the user related
// methods of the Get3w API.
type UserService struct {
	client *Client
}

// Get the authenticated user.
func (s *UserService) Get() (*User, *Response, error) {
	u := "user"
	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, nil, err
	}

	output := new(User)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}
