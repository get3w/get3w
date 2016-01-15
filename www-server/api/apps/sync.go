package apps

import (
	"bytes"
	"net/http"
	"strings"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-server/api"
	"github.com/labstack/echo"
)

// Sync app
func Sync(c *echo.Context) error {
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

	configFile := api.GetConfigFile()
	buffer := bytes.NewBufferString("")
	shouldLogin, err := parser.Sync("", &configFile.AuthConfig, buffer)

	if shouldLogin {
		return api.ErrorUnauthorized(c, nil)
	}
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	return c.JSON(http.StatusOK, &get3w.AppSyncOutput{
		Log: strings.Replace(buffer.String(), "\n", "<br />", -1),
	})
}
