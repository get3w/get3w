package apps

import (
	"net/http"
	"os"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/home"
	"github.com/get3w/get3w/server/api"
	"github.com/labstack/echo"
)

// Delete app
func Delete() echo.HandlerFunc {
	return func(c echo.Context) error {
		appPath := c.Param("app_path")
		if appPath == "" {
			return api.ErrorNotFound(c, nil)
		}

		if api.IsAnonymous(c) {
			return api.ErrorUnauthorized(c, nil)
		}

		input := &get3w.AppDeleteInput{}
		err := api.LoadRequestInput(c, input)
		if err != nil {
			return api.ErrorBadRequest(c, err)
		}

		config, err := home.LoadConfig()
		var appToDelete *get3w.App
		index := -1
		for i, app := range config.Apps {
			if app.Path == appPath {
				appToDelete = app
				index = i
				break
			}
		}
		if appToDelete == nil {
			return api.ErrorNotFound(c, nil)
		}

		if !input.KeepFiles {
			err = os.RemoveAll(appPath)
			if err != nil {
				return api.ErrorBadRequest(c, err)
			}
		}

		config.Apps = append(config.Apps[:index], config.Apps[index+1:]...)
		config.Save()

		return c.JSON(http.StatusOK, appToDelete)
	}
}
