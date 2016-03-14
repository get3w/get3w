package files

import (
	"encoding/base64"
	"net/http"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"
	"github.com/labstack/echo"
)

// Get file content
func Get() echo.HandlerFunc {
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

		data, err := parser.Storage.Read(parser.Storage.GetSourceKey(path))
		if err != nil {
			return api.ErrorNotFound(c, nil)
		}

		output := &get3w.FileGetOutput{
			Content: base64.StdEncoding.EncodeToString(data),
		}
		return c.JSON(http.StatusOK, output)
	}
}
