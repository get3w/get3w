package files

import (
	"net/http"

	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// List return files
func List() echo.HandlerFunc {
	return func(c echo.Context) error {
		appPath := c.Param("app_path")
		if appPath == "" {
			return api.ErrorNotFound(c, nil)
		}
		path := c.P(1)

		app, err := api.GetApp(appPath)
		if err != nil {
			return api.ErrorInternal(c, err)
		}
		if app == nil {
			return api.ErrorNotFound(c, nil)
		}

		parser, err := storage.NewLocalParser(api.Owner(c), appPath)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		files, err := parser.Storage.GetFiles(parser.Storage.GetRootPrefix(path))
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		return c.JSON(http.StatusOK, files)
	}
}
