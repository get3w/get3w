package files

import (
	"encoding/base64"
	"net/http"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-api/api"
	"github.com/labstack/echo"
)

// Get file content
func Get(c *echo.Context) error {
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

	parser, err := storage.NewLocalParser(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	data, err := parser.Storage.Read(parser.Storage.GetSourceKey(path))
	if err != nil {
		return api.ErrorNotFound(c, nil)
	}

	content := base64.StdEncoding.EncodeToString(data)

	output := &get3w.FileGetOutput{
		Content: content,
	}
	return c.JSON(http.StatusOK, output)
}
