package get3w

import "fmt"

// TokenCreateInput specifies optional parameters to the token methods.
type TokenCreateInput struct {
	Scopes string `json:"scopes,omitempty"`
}

// CreateToken create token.
func (s *UsersService) CreateToken(input *TokenCreateInput) (*Token, *Response, error) {
	u := "/users/tokens"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	token := new(Token)
	resp, err := s.client.Do(req, token)
	if err != nil {
		return nil, resp, err
	}

	return token, resp, err
}

// DeleteToken delete token.
func (s *UsersService) DeleteToken(accessToken string) (*Response, error) {
	u := fmt.Sprintf("/users/tokens/%s", accessToken)
	req, err := s.client.NewRequest("DELETE", u, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req, nil)
	if err != nil {
		return resp, err
	}

	return resp, err
}

// TokenGetOptions specifies optional parameters to the token methods.
type TokenGetOptions struct {
	Scopes string `url:"scopes,omitempty"`
}

// GetToken get the token.
func (s *UsersService) GetToken(opt *TokenGetOptions) (*Token, *Response, error) {
	u, err := addOptions("/users/tokens", opt)
	if err != nil {
		return nil, nil, err
	}

	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, nil, err
	}

	token := new(Token)
	resp, err := s.client.Do(req, token)
	if err != nil {
		return nil, resp, err
	}

	return token, resp, err
}

// ListTokens get the token list.
func (s *UsersService) ListTokens() ([]Token, *Response, error) {
	u := "/users/tokens"
	req, err := s.client.NewRequest("GET", u, nil)
	if err != nil {
		return nil, nil, err
	}

	tokens := new([]Token)
	resp, err := s.client.Do(req, tokens)
	if err != nil {
		return nil, resp, err
	}

	return *tokens, resp, err
}

// TokenRegenerateInput specifies optional parameters to the token methods.
type TokenRegenerateInput struct {
	Scopes string `json:"scopes,omitempty"`
}

// RegenerateToken regenerate token.
func (s *UsersService) RegenerateToken(input *TokenRegenerateInput) (*Token, *Response, error) {
	u := "/users/tokens/actions/regenerate"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	token := new(Token)
	resp, err := s.client.Do(req, token)
	if err != nil {
		return nil, resp, err
	}

	return token, resp, err
}
