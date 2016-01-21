package users

import (
	"fmt"
	"net/http"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/home"
	"github.com/get3w/get3w/server/api"
	"github.com/labstack/echo"
)

// Login user login
func Login(c *echo.Context) error {
	input := &get3w.UserLoginInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	if input.Account == "" || input.Password == "" {
		return api.ErrorUnauthorized(c, nil)
	}

	client := get3w.NewClient("")
	output, _, err := client.Users.Login(input)
	if err != nil {
		return api.ErrorUnauthorized(c, err)
	}

	config, _ := home.LoadConfig()
	config.AuthConfig = home.AuthConfig{
		Username:    output.User.Username,
		Password:    input.Password,
		AccessToken: output.AccessToken,
	}

	if err := config.Save(); err != nil {
		return api.ErrorInternal(c, fmt.Errorf("ERROR: failed to save config file: %v", err))
	}

	return c.JSON(http.StatusOK, output)
}
