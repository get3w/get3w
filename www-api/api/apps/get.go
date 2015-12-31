package apps

import (
	"net/http"

	"github.com/get3w/get3w/www-api/api"
	"github.com/labstack/echo"
)

// Get app
func Get(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	return c.JSON(http.StatusOK, app)
}
