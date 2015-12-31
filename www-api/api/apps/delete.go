package apps

import (
	"net/http"
	"os"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/config"
	"github.com/get3w/get3w/www-api/api"
	"github.com/labstack/echo"
)

// Delete app
func Delete(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	configFile, err := config.Load(config.ConfigDir())
	var appToDelete *get3w.App
	index := -1
	for i, app := range configFile.Apps {
		if app.Path == appPath {
			appToDelete = app
			index = i
			break
		}
	}
	if appToDelete == nil {
		return api.ErrorNotFound(c, nil)
	}

	err = os.RemoveAll(appPath)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	configFile.Apps = append(configFile.Apps[:index], configFile.Apps[index+1:]...)
	configFile.Save()

	return c.JSON(http.StatusOK, appToDelete)
}
