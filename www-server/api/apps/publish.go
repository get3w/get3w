package apps

import (
	"net/http"

	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-server/api"
	"github.com/labstack/echo"
)

// Publish app
func Publish(c *echo.Context) error {
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

	parser, err := storage.NewLocalParser(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	parser.Build(true)

	return c.String(http.StatusOK, "")
}
