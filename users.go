package get3w

import "fmt"

// UsersService handles communication with the user related
// methods of the Get3w API.
type UsersService struct {
	client *Client
}

// UserDeleteInput specifies parameters to the UsersService.Delete
// method.
type UserDeleteInput struct {
	Password string `json:"password,omitempty"`
}

// Delete users.
func (s *UsersService) Delete(input *UserDeleteInput) (*Response, error) {
	u := "users"
	req, err := s.client.NewRequest("DELETE", u, input)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req, nil)
	if err != nil {
		return resp, err
	}

	return resp, err
}

// Edit the authenticated user.
func (s *UsersService) Edit(input map[string]interface{}) (*User, *Response, error) {
	u := "users"
	req, err := s.client.NewRequest("PATCH", u, input)
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

// UserLoginInput specifies account and password to the UsersService.Login method.
type UserLoginInput struct {
	Account  string `json:"account,omitempty"`
	Password string `json:"password,omitempty"`
}

// UserLoginOutput specifies response of the UsersService.Login method.
type UserLoginOutput struct {
	User        *User  `json:"user,omitempty"`
	AccessToken string `json:"access_token,omitempty"`
}

// Login by the account and password.
func (s *UsersService) Login(input *UserLoginInput) (*UserLoginOutput, *Response, error) {
	u := "users/actions/login"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := new(UserLoginOutput)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}

// UserPasswordForgotInput specifies parameters to the UsersService.PasswordForgot
// method.
type UserPasswordForgotInput struct {
	Email string `json:"email,omitempty"`
}

// PasswordForgot send password to mail if exists
func (s *UsersService) PasswordForgot(input *UserPasswordForgotInput) (*Response, error) {
	u := fmt.Sprint("users/actions/password_forgot")
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req, nil)
	if err != nil {
		return resp, err
	}

	return resp, err
}

// UserPasswordResetInput specifies parameters to the UsersService.PasswordReset
// method.
type UserPasswordResetInput struct {
	CurrentPassword string `json:"current_password,omitempty"`
	NewPassword     string `json:"new_password,omitempty"`
}

// PasswordReset send password to mail if exists
func (s *UsersService) PasswordReset(input *UserPasswordResetInput) (*Response, error) {
	u := fmt.Sprint("users/actions/password_reset")
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req, nil)
	if err != nil {
		return resp, err
	}

	return resp, err
}

// UserSignupInput specifies account and password to the UsersService.Signup method.
type UserSignupInput struct {
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
	Password string `json:"password,omitempty"`
}

// UserSignupOutput specifies response of the UsersService.Signup method.
type UserSignupOutput struct {
	User        *User  `json:"user,omitempty"`
	AccessToken string `json:"access_token,omitempty"`
}

// Signup user
func (s *UsersService) Signup(input *UserSignupInput) (*UserSignupOutput, *Response, error) {
	u := "users"
	req, err := s.client.NewRequest("POST", u, input)
	if err != nil {
		return nil, nil, err
	}

	output := new(UserSignupOutput)
	resp, err := s.client.Do(req, output)
	if err != nil {
		return nil, resp, err
	}

	return output, resp, err
}
