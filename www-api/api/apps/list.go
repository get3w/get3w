package apps

import (
	"net/http"

	"github.com/get3w/get3w/config"
	"github.com/get3w/get3w/www-api/api"
	"github.com/labstack/echo"
)

// List return apps
func List(c *echo.Context) error {
	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	configFile, err := config.Load(config.ConfigDir())
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	return c.JSON(http.StatusOK, configFile.Apps)
}
