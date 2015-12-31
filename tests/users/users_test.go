package users

import (
	"testing"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/tests"
)

const (
	username    = "test_user_789"
	email       = "corp@siteserver.cn"
	password    = "test_user_789_password"
	newPassword = "test_user_789_newpassword"
)

func TestUsers(t *testing.T) {
	signupInput := &get3w.UserSignupInput{
		Username: username,
		Email:    email,
		Password: password,
	}
	signupOutput, _, err := tests.Client.Users.Signup(signupInput)
	if err != nil {
		t.Fatalf("Users.Signup returned error: %v", err)
	}

	if signupOutput.AccessToken == "" {
		t.Errorf("Users.Signup returned no access token")
	}

	if signupOutput.User == nil {
		t.Errorf("Users.Signup returned no user")
	}

	loginInput := &get3w.UserLoginInput{
		Account:  username,
		Password: password,
	}
	loginOutput, _, err := tests.Client.Users.Login(loginInput)
	if err != nil {
		t.Fatalf("Users.Login returned error: %v", err)
	}

	if loginOutput.AccessToken == "" {
		t.Errorf("Users.Login returned no access token")
	}

	if loginOutput.User == nil {
		t.Errorf("Users.Login returned no user")
	}

	passwordForgotInput := &get3w.UserPasswordForgotInput{
		Email: email,
	}
	_, err = tests.Client.Users.PasswordForgot(passwordForgotInput)
	if err != nil {
		t.Fatalf("Users.PasswordForgot returned error: %v", err)
	}

	clientAuth := get3w.NewClient(loginOutput.AccessToken)

	editInput := map[string]interface{}{
		"company": "company",
	}
	user, _, err := clientAuth.Users.Edit(editInput)
	if err != nil {
		t.Fatalf("Users.Edit returned error: %v", err)
	}

	if user == nil {
		t.Errorf("Users.Edit returned no user")
	}

	passwordResetInput := &get3w.UserPasswordResetInput{
		CurrentPassword: password,
		NewPassword:     newPassword,
	}
	_, err = clientAuth.Users.PasswordReset(passwordResetInput)
	if err != nil {
		t.Fatalf("Users.PasswordReset returned error: %v", err)
	}

	deleteInput := &get3w.UserDeleteInput{
		Password: newPassword,
	}
	_, err = clientAuth.Users.Delete(deleteInput)
	if err != nil {
		t.Fatalf("Users.Delete returned error: %v", err)
	}
}
