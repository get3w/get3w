package users

import (
	"net/http"

	"github.com/get3w/get3w/home"
	"github.com/get3w/get3w/server/api"
	"github.com/labstack/echo"
)

// Logout user logout
func Logout(c *echo.Context) error {
	config, _ := home.LoadConfig()
	err := config.Logout()
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{})
}
