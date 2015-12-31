package users

import (
	"testing"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/tests"
)

func TestUsers_Token(t *testing.T) {
	if !tests.CheckAuth("TestUsers_Token") {
		return
	}

	createInput := &get3w.TokenCreateInput{
		Scopes: "test",
	}
	token, _, err := tests.Client.Users.CreateToken(createInput)
	if err != nil {
		t.Fatalf("Users.TestCreateToken returned error: %v", err)
	}

	if token == nil || token.AccessToken == "" {
		t.Errorf("Users.TestCreateToken returned no access token")
	}

	tokenGetOpt := &get3w.TokenGetOptions{
		Scopes: "test",
	}
	token, _, err = tests.Client.Users.GetToken(tokenGetOpt)
	if err != nil {
		t.Fatalf("Users.GetToken returned error: %v", err)
	}

	if token == nil || token.AccessToken == "" {
		t.Errorf("Users.GetToken returned no access token")
	}

	inputRegenerate := &get3w.TokenRegenerateInput{
		Scopes: "test",
	}
	token, _, err = tests.Client.Users.RegenerateToken(inputRegenerate)
	if err != nil {
		t.Fatalf("Users.RegenerateToken returned error: %v", err)
	}

	if token == nil || token.AccessToken == "" {
		t.Errorf("Users.RegenerateToken returned no access token")
	}

	tokens, _, err := tests.Client.Users.ListTokens()
	if err != nil {
		t.Fatalf("Users.ListTokens returned error: %v", err)
	}

	if len(tokens) < 2 {
		t.Errorf("Users.ListTokens returned less than expected")
	}

	_, err = tests.Client.Users.DeleteToken(token.AccessToken)
	if err != nil {
		t.Fatalf("Users.DeleteToken returned error: %v", err)
	}

	if token == nil || token.AccessToken == "" {
		t.Errorf("Users.TestDeleteToken returned no access token")
	}
}
