package apps

import (
	"bytes"
	"net/http"
	"strings"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/home"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Sync app
func Sync() echo.HandlerFunc {
	return func(c echo.Context) error {
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

		config, err := home.LoadConfig()
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		parser, err := storage.NewLocalParser(api.Owner(c), appPath)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		buffer := bytes.NewBufferString("")
		shouldLogin, err := parser.Push(&config.AuthConfig, buffer)
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
}
